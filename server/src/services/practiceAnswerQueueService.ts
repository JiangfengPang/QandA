import type { Prisma } from '@prisma/client';
import { env } from '../config/env.js';
import { prisma } from '../db/prisma.js';
import { HttpError } from '../utils/http.js';
import { submitPracticeAnswer } from './practiceRecordService.js';
import { getPracticeAnswerWorkerPaused } from './systemControlService.js';
import { normalizeRawAnswerInput } from '../utils/answerNormalization.js';

type QueueItem = {
  id: string;
  userId: string;
  questionId: string;
  clientAnswerId: string;
  selectedJson: unknown;
  durationSeconds: number;
  status: string;
  retryCount: number;
};

type SessionQueueItem = {
  id: string;
  userId: string;
  practiceSessionId: string;
  answersJson: unknown;
  status: string;
  retryCount: number;
};

export type PracticeAnswerQueueInput = {
  questionId: string;
  selected: unknown;
  clientAnswerId: string;
  durationSeconds?: number;
};

export type PracticeAnswerSessionSubmissionInput = {
  practiceSessionId: string;
  clientSubmissionId: string;
  scopeType?: string;
  scopeId?: string;
  answers: PracticeAnswerQueueInput[];
};

const STATUS_PENDING = 'pending';
const STATUS_PROCESSING = 'processing';
const STATUS_RETRYING = 'retrying';
const STATUS_FAILED = 'failed';
const STATUS_PROCESSED = 'processed';
const SESSION_STATUS_IN_PROGRESS = 'in_progress';
const SESSION_STATUS_SUBMITTED = 'submitted';
const SESSION_STATUS_SYNC_FAILED = 'sync_failed';
const PROCESSING_LOCK_MS = 2 * 60 * 1000;
const PAUSED_LOG_INTERVAL_MS = 60 * 1000;

let workerStarted = false;
let stopRequested = false;
let drainTimer: ReturnType<typeof setTimeout> | null = null;
let drainTimerDueAt = 0;
let drainPromise: Promise<void> | null = null;
let startupLogged = false;
let earliestNextDrainAt = 0;
let consecutiveDrainRounds = 0;
let lastStatsLogAt = 0;
let lastPausedLogAt = 0;
let processedSinceLastStatsLog = 0;
let failedSinceLastStatsLog = 0;

const STATS_LOG_PROCESSED_THRESHOLD = 500;

function normalizeSelected(value: unknown) {
  return normalizeRawAnswerInput(value);
}

function clampDurationSeconds(value: unknown) {
  return Math.max(0, Math.min(Math.floor(Number(value) || 0), 30 * 60));
}

function normalizeText(value: unknown, maxLength: number) {
  return String(value || '').trim().slice(0, maxLength);
}

function truncateError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || 'unknown error');
  return message.replace(/\s+/g, ' ').trim().slice(0, 500) || 'unknown error';
}

function isPermanentQueueError(error: unknown) {
  if (!(error instanceof HttpError)) return false;
  return error.status >= 400 && error.status < 500 && error.status !== 429;
}

function retryDelayMs(retryCount: number) {
  const exponent = Math.min(Math.max(retryCount - 1, 0), 6);
  return Math.min(60_000, 1000 * (2 ** exponent));
}

function dueDate(delayMs: number) {
  return new Date(Date.now() + delayMs);
}

function isoDateOrNull(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

function queueStatusLabel(status: string) {
  if (status === STATUS_PENDING || status === STATUS_RETRYING || status === STATUS_PROCESSING || status === STATUS_PROCESSED) return status;
  if (status === STATUS_FAILED) return STATUS_FAILED;
  return status || 'unknown';
}

function shouldUseQueue() {
  return env.practiceAnswerQueueEnabled;
}

async function shouldPauseWorker() {
  if (!await getPracticeAnswerWorkerPaused()) return false;
  const now = Date.now();
  if (!lastPausedLogAt || now - lastPausedLogAt >= PAUSED_LOG_INTERVAL_MS) {
    console.log('answer queue worker paused');
    lastPausedLogAt = now;
  }
  return true;
}

function dedupeQueueInputs(userId: string, items: PracticeAnswerQueueInput[]) {
  const byClientAnswerId = new Map<string, {
    userId: string;
    questionId: string;
    clientAnswerId: string;
    selectedJson: string[];
    durationSeconds: number;
    status: string;
    retryCount: number;
    nextRunAt: Date;
  }>();

  for (const item of items) {
    const row = {
      userId,
      questionId: String(item.questionId || '').trim(),
      clientAnswerId: String(item.clientAnswerId || '').trim(),
      selectedJson: normalizeSelected(item.selected),
      durationSeconds: clampDurationSeconds(item.durationSeconds),
      status: STATUS_PENDING,
      retryCount: 0,
      nextRunAt: new Date()
    };
    if (!row.questionId || !row.clientAnswerId) continue;
    byClientAnswerId.set(row.clientAnswerId, row);
  }

  return [...byClientAnswerId.values()];
}

export async function enqueuePracticeAnswerSubmissions(userId: string, items: PracticeAnswerQueueInput[]) {
  if (!shouldUseQueue() || !items.length) return { accepted: 0, inserted: 0, results: [] };

  const rows = dedupeQueueInputs(userId, items);

  if (!rows.length) return { accepted: 0, inserted: 0, results: [] };

  const existingRows = await prisma.practiceAnswerQueueItem.findMany({
    where: {
      userId,
      clientAnswerId: { in: rows.map((row) => row.clientAnswerId) }
    },
    select: { clientAnswerId: true, status: true }
  });
  const existingStatusByClientAnswerId = new Map(existingRows.map((row) => [row.clientAnswerId, queueStatusLabel(row.status)]));

  const rowsToCreate = rows.filter((row) => !existingStatusByClientAnswerId.has(row.clientAnswerId));
  const result = rowsToCreate.length
    ? await prisma.practiceAnswerQueueItem.createMany({
      data: rowsToCreate,
      skipDuplicates: true
    })
    : { count: 0 };

  const statusRows = await prisma.practiceAnswerQueueItem.findMany({
    where: {
      userId,
      clientAnswerId: { in: rows.map((row) => row.clientAnswerId) }
    },
    select: { clientAnswerId: true, status: true }
  });
  const finalStatusByClientAnswerId = new Map(statusRows.map((row) => [row.clientAnswerId, queueStatusLabel(row.status)]));

  schedulePracticeAnswerQueueDrain(0);
  return {
    accepted: rows.length,
    inserted: result.count,
    results: rows.map((row) => ({
      clientAnswerId: row.clientAnswerId,
      status: existingStatusByClientAnswerId.has(row.clientAnswerId)
        ? `duplicate:${existingStatusByClientAnswerId.get(row.clientAnswerId)}`
        : finalStatusByClientAnswerId.get(row.clientAnswerId) || 'queued'
    }))
  };
}

export function dedupeSessionAnswers(practiceSessionId: string, items: PracticeAnswerQueueInput[]) {
  const byClientAnswerId = new Map<string, {
    questionId: string;
    selected: string[];
    clientAnswerId: string;
    durationSeconds: number;
  }>();

  for (const item of items) {
    const row = {
      questionId: normalizeText(item.questionId, 191),
      selected: normalizeSelected(item.selected),
      clientAnswerId: normalizeText(item.clientAnswerId, 120),
      durationSeconds: clampDurationSeconds(item.durationSeconds)
    };
    if (!row.questionId || !row.clientAnswerId) continue;
    byClientAnswerId.set(row.clientAnswerId, row);
  }

  const bySessionQuestion = new Map<string, {
    questionId: string;
    selected: string[];
    clientAnswerId: string;
    durationSeconds: number;
  }>();
  for (const row of byClientAnswerId.values()) {
    bySessionQuestion.set(`${practiceSessionId}:${row.questionId}`, row);
  }
  return [...bySessionQuestion.values()];
}

async function ensurePracticeSession(userId: string, input: PracticeAnswerSessionSubmissionInput, answerCount: number) {
  const practiceSessionId = normalizeText(input.practiceSessionId, 191);
  if (!practiceSessionId) throw new HttpError('练习会话标识不能为空', 400);
  const existing = await prisma.practiceSession.findUnique({ where: { id: practiceSessionId } });
  if (existing && existing.userId !== userId) throw new HttpError('练习会话不存在或无权访问', 403);
  if (existing) return existing;

  return prisma.practiceSession.create({
    data: {
      id: practiceSessionId,
      userId,
      scopeType: normalizeText(input.scopeType || 'practice', 40) || 'practice',
      scopeId: normalizeText(input.scopeId, 191) || null,
      status: answerCount > 0 ? SESSION_STATUS_IN_PROGRESS : SESSION_STATUS_SYNC_FAILED,
      answerCount
    }
  });
}

export async function enqueuePracticeAnswerSessionSubmission(userId: string, input: PracticeAnswerSessionSubmissionInput) {
  if (!shouldUseQueue()) return { accepted: 0, queued: 0, submissionStatus: 'disabled', results: [] };
  const practiceSessionId = normalizeText(input.practiceSessionId, 191);
  const clientSubmissionId = normalizeText(input.clientSubmissionId || input.practiceSessionId, 120);
  if (!practiceSessionId) throw new HttpError('练习会话标识不能为空', 400);
  if (!clientSubmissionId) throw new HttpError('提交标识不能为空', 400);

  const answers = dedupeSessionAnswers(practiceSessionId, input.answers);
  if (!answers.length) return { accepted: 0, queued: 0, submissionStatus: 'empty', results: [] };

  await ensurePracticeSession(userId, { ...input, practiceSessionId, clientSubmissionId }, answers.length);
  const payload = answers as unknown as Prisma.InputJsonValue;

  const existingBySession = await prisma.practiceAnswerSubmissionQueue.findUnique({
    where: { userId_practiceSessionId: { userId, practiceSessionId } },
    select: { id: true, status: true }
  });

  if (existingBySession) {
    if (existingBySession.status === STATUS_PROCESSED) {
      return {
        accepted: answers.length,
        queued: 0,
        submissionStatus: STATUS_PROCESSED,
        results: answers.map((answer) => ({ clientAnswerId: answer.clientAnswerId, status: `duplicate:${STATUS_PROCESSED}` }))
      };
    }

    if (existingBySession.status === STATUS_PROCESSING) {
      return {
        accepted: answers.length,
        queued: 0,
        submissionStatus: STATUS_PROCESSING,
        results: answers.map((answer) => ({ clientAnswerId: answer.clientAnswerId, status: `duplicate:${STATUS_PROCESSING}` }))
      };
    }

    await prisma.practiceAnswerSubmissionQueue.update({
      where: { id: existingBySession.id },
      data: {
        clientSubmissionId,
        answersJson: payload,
        status: existingBySession.status === STATUS_FAILED ? STATUS_RETRYING : existingBySession.status,
        nextRunAt: new Date(),
        lastError: null
      }
    });
    schedulePracticeAnswerQueueDrain(0);
    return {
      accepted: answers.length,
      queued: 0,
      submissionStatus: existingBySession.status,
      results: answers.map((answer) => ({ clientAnswerId: answer.clientAnswerId, status: `duplicate:${existingBySession.status}` }))
    };
  }

  const existingByClientSubmission = await prisma.practiceAnswerSubmissionQueue.findUnique({
    where: { userId_clientSubmissionId: { userId, clientSubmissionId } },
    select: { practiceSessionId: true }
  });
  if (existingByClientSubmission && existingByClientSubmission.practiceSessionId !== practiceSessionId) {
    throw new HttpError('提交标识已用于其他练习会话', 409);
  }

  await prisma.practiceAnswerSubmissionQueue.create({
    data: {
      userId,
      practiceSessionId,
      clientSubmissionId,
      answersJson: payload,
      status: STATUS_PENDING,
      retryCount: 0,
      nextRunAt: new Date()
    }
  });
  schedulePracticeAnswerQueueDrain(0);
  return {
    accepted: answers.length,
    queued: 1,
    submissionStatus: STATUS_PENDING,
    results: answers.map((answer) => ({ clientAnswerId: answer.clientAnswerId, status: 'queued' }))
  };
}

async function resetStaleProcessingLocks() {
  const staleBefore = new Date(Date.now() - PROCESSING_LOCK_MS);
  await Promise.all([
    prisma.practiceAnswerQueueItem.updateMany({
      where: {
        status: STATUS_PROCESSING,
        lockedAt: { lt: staleBefore }
      },
      data: {
        status: STATUS_RETRYING,
        lockedAt: null,
        lastError: 'processor lock expired',
        nextRunAt: new Date()
      }
    }),
    prisma.practiceAnswerSubmissionQueue.updateMany({
      where: {
        status: STATUS_PROCESSING,
        lockedAt: { lt: staleBefore }
      },
      data: {
        status: STATUS_RETRYING,
        lockedAt: null,
        lastError: 'processor lock expired',
        nextRunAt: new Date()
      }
    })
  ]);
}

async function lockQueueItem(item: QueueItem) {
  const result = await prisma.practiceAnswerQueueItem.updateMany({
    where: {
      id: item.id,
      status: item.status,
      nextRunAt: { lte: new Date() }
    },
    data: {
      status: STATUS_PROCESSING,
      lockedAt: new Date()
    }
  });
  return result.count > 0;
}

async function markQueueItemProcessed(itemId: string) {
  await prisma.practiceAnswerQueueItem.update({
    where: { id: itemId },
    data: {
      status: STATUS_PROCESSED,
      lockedAt: null,
      processedAt: new Date(),
      lastError: null
    }
  });
}

async function markQueueItemFailed(item: QueueItem, error: unknown) {
  const nextRetryCount = item.retryCount + 1;
  const permanent = isPermanentQueueError(error) || nextRetryCount >= env.practiceAnswerQueueMaxAttempts;
  await prisma.practiceAnswerQueueItem.update({
    where: { id: item.id },
    data: {
      status: permanent ? STATUS_FAILED : STATUS_RETRYING,
      retryCount: nextRetryCount,
      lockedAt: null,
      lastError: truncateError(error),
      nextRunAt: permanent ? new Date() : dueDate(retryDelayMs(nextRetryCount)),
      processedAt: permanent ? new Date() : null
    }
  });

  const label = permanent ? 'failed' : 'retry scheduled';
  console.error(`Practice answer queue item ${item.id} ${label}: ${truncateError(error)}`);
}

async function processQueueItem(item: QueueItem) {
  const locked = await lockQueueItem(item);
  if (!locked) return 'skipped' as const;

  try {
    await submitPracticeAnswer(
      item.userId,
      item.questionId,
      normalizeSelected(item.selectedJson),
      item.durationSeconds,
      item.clientAnswerId
    );
    await markQueueItemProcessed(item.id);
    return 'processed' as const;
  } catch (error) {
    await markQueueItemFailed(item, error);
    return 'failed' as const;
  }
}

function normalizeSessionQueueAnswers(value: unknown): PracticeAnswerQueueInput[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const raw = item && typeof item === 'object' ? item as Partial<PracticeAnswerQueueInput> : {};
    return {
      questionId: normalizeText(raw.questionId, 191),
      selected: normalizeSelected(raw.selected),
      clientAnswerId: normalizeText(raw.clientAnswerId, 120),
      durationSeconds: clampDurationSeconds(raw.durationSeconds)
    };
  }).filter((item) => item.questionId && item.clientAnswerId);
}

async function lockSessionQueueItem(item: SessionQueueItem) {
  const result = await prisma.practiceAnswerSubmissionQueue.updateMany({
    where: {
      id: item.id,
      status: item.status,
      nextRunAt: { lte: new Date() }
    },
    data: {
      status: STATUS_PROCESSING,
      lockedAt: new Date()
    }
  });
  return result.count > 0;
}

async function markSessionQueueItemProcessed(item: SessionQueueItem, summary: {
  answerCount: number;
  correctCount: number;
  durationSeconds: number;
}) {
  await prisma.$transaction([
    prisma.practiceSession.update({
      where: { id: item.practiceSessionId },
      data: {
        status: SESSION_STATUS_SUBMITTED,
        answerCount: summary.answerCount,
        correctCount: summary.correctCount,
        durationSeconds: summary.durationSeconds,
        submittedAt: new Date()
      }
    }),
    prisma.practiceAnswerSubmissionQueue.update({
      where: { id: item.id },
      data: {
        status: STATUS_PROCESSED,
        lockedAt: null,
        processedAt: new Date(),
        lastError: null
      }
    })
  ]);
}

async function markSessionQueueItemFailed(item: SessionQueueItem, error: unknown) {
  const nextRetryCount = item.retryCount + 1;
  const permanent = isPermanentQueueError(error) || nextRetryCount >= env.practiceAnswerQueueMaxAttempts;
  await prisma.$transaction([
    prisma.practiceAnswerSubmissionQueue.update({
      where: { id: item.id },
      data: {
        status: permanent ? STATUS_FAILED : STATUS_RETRYING,
        retryCount: nextRetryCount,
        lockedAt: null,
        lastError: truncateError(error),
        nextRunAt: permanent ? new Date() : dueDate(retryDelayMs(nextRetryCount)),
        processedAt: permanent ? new Date() : null
      }
    }),
    ...(permanent ? [
      prisma.practiceSession.update({
        where: { id: item.practiceSessionId },
        data: { status: SESSION_STATUS_SYNC_FAILED }
      })
    ] : [])
  ]);

  const label = permanent ? 'failed' : 'retry scheduled';
  console.error(`Practice answer session queue item ${item.id} ${label}: ${truncateError(error)}`);
}

async function processSessionQueueItem(item: SessionQueueItem) {
  const locked = await lockSessionQueueItem(item);
  if (!locked) return 'skipped' as const;

  try {
    const answers = dedupeSessionAnswers(item.practiceSessionId, normalizeSessionQueueAnswers(item.answersJson));
    if (!answers.length) throw new HttpError('练习会话没有可提交答案', 400);

    let correctCount = 0;
    let durationSeconds = 0;
    for (const answer of answers) {
      const result = await submitPracticeAnswer(
        item.userId,
        answer.questionId,
        normalizeSelected(answer.selected),
        answer.durationSeconds,
        answer.clientAnswerId
      );
      if (result.correct) correctCount += 1;
      durationSeconds += clampDurationSeconds(answer.durationSeconds);
    }

    await markSessionQueueItemProcessed(item, {
      answerCount: answers.length,
      correctCount,
      durationSeconds
    });
    return 'processed' as const;
  } catch (error) {
    await markSessionQueueItemFailed(item, error);
    return 'failed' as const;
  }
}

async function drainPracticeAnswerQueue() {
  if (!shouldUseQueue()) return false;
  if (await shouldPauseWorker()) return false;
  consecutiveDrainRounds += 1;
  await resetStaleProcessingLocks();

  const sessionItems = await prisma.practiceAnswerSubmissionQueue.findMany({
    where: {
      status: { in: [STATUS_PENDING, STATUS_RETRYING] },
      nextRunAt: { lte: new Date() }
    },
    orderBy: { createdAt: 'asc' },
    take: env.practiceAnswerQueueBatchSize
  });

  let sessionProcessedCount = 0;
  let sessionFailedCount = 0;
  for (let index = 0; index < sessionItems.length && !stopRequested; index += env.practiceAnswerQueueConcurrency) {
    const chunk = sessionItems.slice(index, index + env.practiceAnswerQueueConcurrency);
    const results = await Promise.all(chunk.map((item) => processSessionQueueItem(item)));
    sessionProcessedCount += results.filter((result) => result === 'processed').length;
    sessionFailedCount += results.filter((result) => result === 'failed').length;
  }

  const items = await prisma.practiceAnswerQueueItem.findMany({
    where: {
      status: { in: [STATUS_PENDING, STATUS_RETRYING] },
      nextRunAt: { lte: new Date() }
    },
    orderBy: { createdAt: 'asc' },
    take: env.practiceAnswerQueueBatchSize
  });

  let processedCount = sessionProcessedCount;
  let failedCount = sessionFailedCount;
  for (let index = 0; index < items.length && !stopRequested; index += env.practiceAnswerQueueConcurrency) {
    const chunk = items.slice(index, index + env.practiceAnswerQueueConcurrency);
    const results = await Promise.all(chunk.map((item) => processQueueItem(item)));
    processedCount += results.filter((result) => result === 'processed').length;
    failedCount += results.filter((result) => result === 'failed').length;
  }

  await maybeLogPracticeAnswerQueueStats({ processedCount, failedCount });
  return sessionItems.length >= env.practiceAnswerQueueBatchSize || items.length >= env.practiceAnswerQueueBatchSize;
}

function shouldLogPracticeAnswerQueueStats() {
  const now = Date.now();
  if (!lastStatsLogAt) return true;
  if (now - lastStatsLogAt >= env.practiceAnswerQueueStatsLogIntervalMs) return true;
  if (processedSinceLastStatsLog >= STATS_LOG_PROCESSED_THRESHOLD) return true;
  return false;
}

async function maybeLogPracticeAnswerQueueStats(summary: { processedCount: number; failedCount: number }) {
  processedSinceLastStatsLog += summary.processedCount;
  failedSinceLastStatsLog += summary.failedCount;
  if (!shouldLogPracticeAnswerQueueStats()) return;

  const [grouped, sessionGrouped] = await Promise.all([
    prisma.practiceAnswerQueueItem.groupBy({
      by: ['status'],
      _count: { _all: true }
    }),
    prisma.practiceAnswerSubmissionQueue.groupBy({
      by: ['status'],
      _count: { _all: true }
    })
  ]);
  const countByStatus = new Map(grouped.map((row) => [row.status, row._count._all]));
  const sessionCountByStatus = new Map(sessionGrouped.map((row) => [row.status, row._count._all]));
  const pendingCount = (countByStatus.get(STATUS_PENDING) || 0) + (countByStatus.get(STATUS_RETRYING) || 0);
  const sessionPendingCount = (sessionCountByStatus.get(STATUS_PENDING) || 0) + (sessionCountByStatus.get(STATUS_RETRYING) || 0);
  const processingCount = countByStatus.get(STATUS_PROCESSING) || 0;
  const sessionProcessingCount = sessionCountByStatus.get(STATUS_PROCESSING) || 0;
  const failedTotal = countByStatus.get(STATUS_FAILED) || 0;
  const sessionFailedTotal = sessionCountByStatus.get(STATUS_FAILED) || 0;
  console.log(
    `answer queue worker stats: pending=${pendingCount}, sessionPending=${sessionPendingCount}, processing=${processingCount}, sessionProcessing=${sessionProcessingCount}, failed=${failedTotal}, sessionFailed=${sessionFailedTotal}, processedSinceLastLog=${processedSinceLastStatsLog}, failedSinceLastLog=${failedSinceLastStatsLog}`
  );
  lastStatsLogAt = Date.now();
  processedSinceLastStatsLog = 0;
  failedSinceLastStatsLog = 0;
}

function nextDrainDelayMs(requestedDelayMs: number) {
  const requested = Math.max(0, requestedDelayMs);
  if (!env.practiceAnswerQueueStrictInterval) return requested;
  return Math.max(requested, earliestNextDrainAt - Date.now(), 0);
}

function shouldDrainAgainImmediately(hasMore: boolean) {
  if (!hasMore || env.practiceAnswerQueueStrictInterval) return false;
  return consecutiveDrainRounds < env.practiceAnswerQueueMaxDrainRounds;
}

function nextDelayAfterDrain(hasMore: boolean) {
  if (shouldDrainAgainImmediately(hasMore)) return 0;
  consecutiveDrainRounds = 0;
  return env.practiceAnswerQueuePollMs;
}

export function schedulePracticeAnswerQueueDrain(delayMs = env.practiceAnswerQueuePollMs) {
  if (!workerStarted || stopRequested || !shouldUseQueue()) return;
  const safeDelayMs = nextDrainDelayMs(delayMs);
  const dueAt = Date.now() + safeDelayMs;
  if (drainTimer && drainTimerDueAt <= dueAt) return;
  if (drainTimer) clearTimeout(drainTimer);

  drainTimerDueAt = dueAt;
  drainTimer = setTimeout(() => {
    drainTimer = null;
    drainTimerDueAt = 0;
    if (drainPromise) return;

    drainPromise = drainPracticeAnswerQueue()
      .then((hasMore) => {
        drainPromise = null;
        earliestNextDrainAt = Date.now() + env.practiceAnswerQueuePollMs;
        if (!stopRequested) schedulePracticeAnswerQueueDrain(nextDelayAfterDrain(hasMore));
      })
      .catch((error) => {
        drainPromise = null;
        consecutiveDrainRounds = 0;
        earliestNextDrainAt = Date.now() + env.practiceAnswerQueuePollMs;
        console.error(`Practice answer queue drain failed: ${truncateError(error)}`);
        if (!stopRequested) schedulePracticeAnswerQueueDrain(env.practiceAnswerQueuePollMs);
      });
  }, safeDelayMs);
  drainTimer.unref?.();
}

export function startPracticeAnswerQueueWorker() {
  if (workerStarted || !shouldUseQueue()) return;
  workerStarted = true;
  stopRequested = false;
  if (!startupLogged) {
    startupLogged = true;
    console.log(
      `answer queue worker started: batch size=${env.practiceAnswerQueueBatchSize}, concurrency=${env.practiceAnswerQueueConcurrency}, poll interval=${env.practiceAnswerQueuePollMs}ms, strict interval=${env.practiceAnswerQueueStrictInterval}, max drain rounds=${env.practiceAnswerQueueMaxDrainRounds}, stats interval=${env.practiceAnswerQueueStatsLogIntervalMs}ms`
    );
  }
  schedulePracticeAnswerQueueDrain(0);
}

export async function stopPracticeAnswerQueueWorker() {
  stopRequested = true;
  if (drainTimer) {
    clearTimeout(drainTimer);
    drainTimer = null;
    drainTimerDueAt = 0;
  }
  if (drainPromise) await drainPromise;
  workerStarted = false;
}

export function practiceAnswerQueueWorkerConfig() {
  return {
    enabled: env.practiceAnswerQueueEnabled,
    batchSize: env.practiceAnswerQueueBatchSize,
    concurrency: env.practiceAnswerQueueConcurrency,
    pollMs: env.practiceAnswerQueuePollMs,
    maxAttempts: env.practiceAnswerQueueMaxAttempts,
    statsLogIntervalMs: env.practiceAnswerQueueStatsLogIntervalMs,
    strictInterval: env.practiceAnswerQueueStrictInterval,
    maxDrainRounds: env.practiceAnswerQueueMaxDrainRounds
  };
}

export async function getPracticeAnswerQueueMonitor() {
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
  const [grouped, sessionGrouped, recentCreatedCount, recentSessionCreatedCount, recentProcessedCount, recentSessionProcessedCount, failedRows, sessionFailedRows] = await Promise.all([
    prisma.practiceAnswerQueueItem.groupBy({
      by: ['status'],
      _count: { _all: true }
    }),
    prisma.practiceAnswerSubmissionQueue.groupBy({
      by: ['status'],
      _count: { _all: true }
    }),
    prisma.practiceAnswerQueueItem.count({
      where: { createdAt: { gte: fiveMinutesAgo } }
    }),
    prisma.practiceAnswerSubmissionQueue.count({
      where: { createdAt: { gte: fiveMinutesAgo } }
    }),
    prisma.practiceAnswerQueueItem.count({
      where: { status: STATUS_PROCESSED, processedAt: { gte: fiveMinutesAgo } }
    }),
    prisma.practiceAnswerSubmissionQueue.count({
      where: { status: STATUS_PROCESSED, processedAt: { gte: fiveMinutesAgo } }
    }),
    prisma.practiceAnswerQueueItem.findMany({
      where: { status: STATUS_FAILED, lastError: { not: null } },
      orderBy: { updatedAt: 'desc' },
      take: 500,
      select: { lastError: true }
    }),
    prisma.practiceAnswerSubmissionQueue.findMany({
      where: { status: STATUS_FAILED, lastError: { not: null } },
      orderBy: { updatedAt: 'desc' },
      take: 500,
      select: { lastError: true }
    })
  ]);

  const countByStatus = new Map(grouped.map((row) => [row.status, row._count._all]));
  const sessionCountByStatus = new Map(sessionGrouped.map((row) => [row.status, row._count._all]));
  const failedReasonCounts = new Map<string, number>();
  for (const row of [...failedRows, ...sessionFailedRows]) {
    const reason = truncateError(row.lastError || 'unknown error');
    failedReasonCounts.set(reason, (failedReasonCounts.get(reason) || 0) + 1);
  }

  return {
    counts: {
      pending: countByStatus.get(STATUS_PENDING) || 0,
      retrying: countByStatus.get(STATUS_RETRYING) || 0,
      processing: countByStatus.get(STATUS_PROCESSING) || 0,
      failed: countByStatus.get(STATUS_FAILED) || 0,
      processed: countByStatus.get(STATUS_PROCESSED) || 0
    },
    sessionCounts: {
      pending: sessionCountByStatus.get(STATUS_PENDING) || 0,
      retrying: sessionCountByStatus.get(STATUS_RETRYING) || 0,
      processing: sessionCountByStatus.get(STATUS_PROCESSING) || 0,
      failed: sessionCountByStatus.get(STATUS_FAILED) || 0,
      processed: sessionCountByStatus.get(STATUS_PROCESSED) || 0
    },
    recentFiveMinutes: {
      created: recentCreatedCount + recentSessionCreatedCount,
      processed: recentProcessedCount + recentSessionProcessedCount,
      legacyCreated: recentCreatedCount,
      sessionCreated: recentSessionCreatedCount,
      legacyProcessed: recentProcessedCount,
      sessionProcessed: recentSessionProcessedCount
    },
    failedReasonsTop10: [...failedReasonCounts.entries()]
      .sort((left, right) => right[1] - left[1])
      .slice(0, 10)
      .map(([reason, count]) => ({ reason, count })),
    worker: {
      started: workerStarted,
      drainRunning: Boolean(drainPromise),
      nextDrainAt: drainTimerDueAt ? new Date(drainTimerDueAt).toISOString() : null,
      lastPausedLogAt: isoDateOrNull(lastPausedLogAt ? new Date(lastPausedLogAt) : null),
      config: practiceAnswerQueueWorkerConfig()
    }
  };
}
