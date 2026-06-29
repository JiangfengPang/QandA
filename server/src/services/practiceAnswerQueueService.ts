import { env } from '../config/env.js';
import { prisma } from '../db/prisma.js';
import { HttpError } from '../utils/http.js';
import { submitPracticeAnswer } from './practiceRecordService.js';

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

export type PracticeAnswerQueueInput = {
  questionId: string;
  selected: string[];
  clientAnswerId: string;
  durationSeconds?: number;
};

const STATUS_PENDING = 'pending';
const STATUS_PROCESSING = 'processing';
const STATUS_RETRYING = 'retrying';
const STATUS_FAILED = 'failed';
const STATUS_PROCESSED = 'processed';
const PROCESSING_LOCK_MS = 2 * 60 * 1000;

let workerStarted = false;
let stopRequested = false;
let drainTimer: ReturnType<typeof setTimeout> | null = null;
let drainTimerDueAt = 0;
let drainPromise: Promise<void> | null = null;
let startupLogged = false;
let earliestNextDrainAt = 0;
let consecutiveDrainRounds = 0;
let lastStatsLogAt = 0;
let processedSinceLastStatsLog = 0;
let failedSinceLastStatsLog = 0;

const STATS_LOG_PROCESSED_THRESHOLD = 500;

function normalizeSelected(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => String(item)).filter((item) => item.length <= 5000)
    : [];
}

function clampDurationSeconds(value: unknown) {
  return Math.max(0, Math.min(Math.floor(Number(value) || 0), 30 * 60));
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

function queueStatusLabel(status: string) {
  if (status === STATUS_PENDING || status === STATUS_RETRYING || status === STATUS_PROCESSING || status === STATUS_PROCESSED) return status;
  if (status === STATUS_FAILED) return STATUS_FAILED;
  return status || 'unknown';
}

function shouldUseQueue() {
  return env.practiceAnswerQueueEnabled;
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

async function resetStaleProcessingLocks() {
  const staleBefore = new Date(Date.now() - PROCESSING_LOCK_MS);
  await prisma.practiceAnswerQueueItem.updateMany({
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
  });
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

async function drainPracticeAnswerQueue() {
  if (!shouldUseQueue()) return false;
  consecutiveDrainRounds += 1;
  await resetStaleProcessingLocks();

  const items = await prisma.practiceAnswerQueueItem.findMany({
    where: {
      status: { in: [STATUS_PENDING, STATUS_RETRYING] },
      nextRunAt: { lte: new Date() }
    },
    orderBy: { createdAt: 'asc' },
    take: env.practiceAnswerQueueBatchSize
  });

  let processedCount = 0;
  let failedCount = 0;
  for (let index = 0; index < items.length && !stopRequested; index += env.practiceAnswerQueueConcurrency) {
    const chunk = items.slice(index, index + env.practiceAnswerQueueConcurrency);
    const results = await Promise.all(chunk.map((item) => processQueueItem(item)));
    processedCount += results.filter((result) => result === 'processed').length;
    failedCount += results.filter((result) => result === 'failed').length;
  }

  await maybeLogPracticeAnswerQueueStats({ processedCount, failedCount });
  return items.length >= env.practiceAnswerQueueBatchSize;
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

  const grouped = await prisma.practiceAnswerQueueItem.groupBy({
    by: ['status'],
    _count: { _all: true }
  });
  const countByStatus = new Map(grouped.map((row) => [row.status, row._count._all]));
  const pendingCount = (countByStatus.get(STATUS_PENDING) || 0) + (countByStatus.get(STATUS_RETRYING) || 0);
  const processingCount = countByStatus.get(STATUS_PROCESSING) || 0;
  const failedTotal = countByStatus.get(STATUS_FAILED) || 0;
  console.log(
    `answer queue worker stats: pending=${pendingCount}, processing=${processingCount}, failed=${failedTotal}, processedSinceLastLog=${processedSinceLastStatsLog}, failedSinceLastLog=${failedSinceLastStatsLog}`
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
  const [grouped, recentCreatedCount, recentProcessedCount, failedRows] = await Promise.all([
    prisma.practiceAnswerQueueItem.groupBy({
      by: ['status'],
      _count: { _all: true }
    }),
    prisma.practiceAnswerQueueItem.count({
      where: { createdAt: { gte: fiveMinutesAgo } }
    }),
    prisma.practiceAnswerQueueItem.count({
      where: { status: STATUS_PROCESSED, processedAt: { gte: fiveMinutesAgo } }
    }),
    prisma.practiceAnswerQueueItem.findMany({
      where: { status: STATUS_FAILED, lastError: { not: null } },
      orderBy: { updatedAt: 'desc' },
      take: 500,
      select: { lastError: true }
    })
  ]);

  const countByStatus = new Map(grouped.map((row) => [row.status, row._count._all]));
  const failedReasonCounts = new Map<string, number>();
  for (const row of failedRows) {
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
    recentFiveMinutes: {
      created: recentCreatedCount,
      processed: recentProcessedCount
    },
    failedReasonsTop10: [...failedReasonCounts.entries()]
      .sort((left, right) => right[1] - left[1])
      .slice(0, 10)
      .map(([reason, count]) => ({ reason, count })),
    worker: {
      started: workerStarted,
      drainRunning: Boolean(drainPromise),
      nextDrainAt: drainTimerDueAt ? new Date(drainTimerDueAt).toISOString() : null,
      config: practiceAnswerQueueWorkerConfig()
    }
  };
}
