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

function shouldUseQueue() {
  return env.practiceAnswerQueueEnabled;
}

export async function enqueuePracticeAnswerSubmissions(userId: string, items: PracticeAnswerQueueInput[]) {
  if (!shouldUseQueue() || !items.length) return { accepted: 0, inserted: 0, results: [] };

  const rows = items
    .map((item) => ({
      userId,
      questionId: String(item.questionId || '').trim(),
      clientAnswerId: String(item.clientAnswerId || '').trim(),
      selectedJson: normalizeSelected(item.selected),
      durationSeconds: clampDurationSeconds(item.durationSeconds),
      status: STATUS_PENDING,
      retryCount: 0,
      nextRunAt: new Date()
    }))
    .filter((item) => item.questionId && item.clientAnswerId);

  if (!rows.length) return { accepted: 0, inserted: 0, results: [] };

  const existingRows = await prisma.practiceAnswerQueueItem.findMany({
    where: {
      userId,
      clientAnswerId: { in: rows.map((row) => row.clientAnswerId) }
    },
    select: { clientAnswerId: true }
  });
  const existingClientAnswerIds = new Set(existingRows.map((row) => row.clientAnswerId));

  const result = await prisma.practiceAnswerQueueItem.createMany({
    data: rows.filter((row) => !existingClientAnswerIds.has(row.clientAnswerId)),
    skipDuplicates: true
  });
  schedulePracticeAnswerQueueDrain(0);
  return {
    accepted: rows.length,
    inserted: result.count,
    results: rows.map((row) => ({
      clientAnswerId: row.clientAnswerId,
      status: existingClientAnswerIds.has(row.clientAnswerId) ? 'duplicate' : 'queued'
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

  await logPracticeAnswerQueueStats({ processedCount, failedCount });
  return items.length >= env.practiceAnswerQueueBatchSize;
}

async function logPracticeAnswerQueueStats(summary: { processedCount: number; failedCount: number }) {
  const grouped = await prisma.practiceAnswerQueueItem.groupBy({
    by: ['status'],
    _count: { _all: true }
  });
  const countByStatus = new Map(grouped.map((row) => [row.status, row._count._all]));
  const pendingCount = (countByStatus.get(STATUS_PENDING) || 0) + (countByStatus.get(STATUS_RETRYING) || 0);
  const processingCount = countByStatus.get(STATUS_PROCESSING) || 0;
  const failedTotal = countByStatus.get(STATUS_FAILED) || 0;
  console.log(
    `answer queue worker stats: pending=${pendingCount}, processing=${processingCount}, failed=${failedTotal}, processedThisRound=${summary.processedCount}, failedThisRound=${summary.failedCount}`
  );
}

export function schedulePracticeAnswerQueueDrain(delayMs = env.practiceAnswerQueuePollMs) {
  if (!workerStarted || stopRequested || !shouldUseQueue()) return;
  const dueAt = Date.now() + Math.max(0, delayMs);
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
        if (!stopRequested) schedulePracticeAnswerQueueDrain(hasMore ? 0 : env.practiceAnswerQueuePollMs);
      })
      .catch((error) => {
        drainPromise = null;
        console.error(`Practice answer queue drain failed: ${truncateError(error)}`);
        if (!stopRequested) schedulePracticeAnswerQueueDrain(env.practiceAnswerQueuePollMs);
      });
  }, Math.max(0, delayMs));
  drainTimer.unref?.();
}

export function startPracticeAnswerQueueWorker() {
  if (workerStarted || !shouldUseQueue()) return;
  workerStarted = true;
  stopRequested = false;
  if (!startupLogged) {
    startupLogged = true;
    console.log(
      `answer queue worker started: batch size=${env.practiceAnswerQueueBatchSize}, concurrency=${env.practiceAnswerQueueConcurrency}, poll interval=${env.practiceAnswerQueuePollMs}ms`
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
