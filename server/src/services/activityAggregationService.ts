import type { Prisma } from '@prisma/client';
import { env } from '../config/env.js';
import { prisma } from '../db/prisma.js';
import { dbDateForLocalDay, dbDateKey } from '../utils/date.js';

const CURSOR_ID = 'default';

type ActivityAnswerRow = {
  id: string;
  userId: string;
  createdAt: Date;
  isCorrect: boolean;
  durationSeconds: number | null;
};

export type ActivityAggregationAnswer = ActivityAnswerRow;

type ActivityAggregate = {
  userId: string;
  activityDate: Date;
  answerCount: number;
  correctCount: number;
  durationSeconds: number;
  firstAnsweredAt: Date;
  lastAnsweredAt: Date;
};

let workerStarted = false;
let stopRequested = false;
let drainTimer: NodeJS.Timeout | null = null;
let drainTimerDueAt = 0;
let drainPromise: Promise<boolean> | null = null;
let consecutiveDrainRounds = 0;
let lastStatsLogAt = 0;
let processedSinceLastLog = 0;

function shouldUseActivityAggregation() {
  return env.activityAggregationEnabled;
}

function truncateError(error: unknown, max = 500) {
  const message = error instanceof Error ? error.message : String(error);
  return message.length > max ? `${message.slice(0, max - 3)}...` : message;
}

function boundedDurationSeconds(value: number | null | undefined) {
  const parsed = Math.floor(Number(value || 0));
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.min(parsed, 30 * 60);
}

export function buildActivityAggregatesFromAnswers(rows: ActivityAggregationAnswer[]) {
  const map = new Map<string, ActivityAggregate>();

  for (const row of rows) {
    const activityDate = dbDateForLocalDay(row.createdAt);
    const key = `${row.userId}:${dbDateKey(activityDate)}`;
    const current = map.get(key);
    if (!current) {
      map.set(key, {
        userId: row.userId,
        activityDate,
        answerCount: 1,
        correctCount: row.isCorrect ? 1 : 0,
        durationSeconds: boundedDurationSeconds(row.durationSeconds),
        firstAnsweredAt: row.createdAt,
        lastAnsweredAt: row.createdAt
      });
      continue;
    }

    current.answerCount += 1;
    if (row.isCorrect) current.correctCount += 1;
    current.durationSeconds += boundedDurationSeconds(row.durationSeconds);
    if (row.createdAt.getTime() < current.firstAnsweredAt.getTime()) current.firstAnsweredAt = row.createdAt;
    if (row.createdAt.getTime() > current.lastAnsweredAt.getTime()) current.lastAnsweredAt = row.createdAt;
  }

  return Array.from(map.values());
}

async function readCursor() {
  return prisma.activityAggregationCursor.findUnique({ where: { id: CURSOR_ID } });
}

export async function acquireActivityAggregationLock(tx: Prisma.TransactionClient) {
  await tx.$executeRaw`INSERT INTO ActivityAggregationCursor (id, createdAt, updatedAt)
    VALUES (${CURSOR_ID}, NOW(3), NOW(3)) ON DUPLICATE KEY UPDATE id = ${CURSOR_ID}`;
  await tx.$queryRaw`SELECT id FROM ActivityAggregationCursor WHERE id = ${CURSOR_ID} FOR UPDATE`;
}

async function markAggregationFailure(error: unknown) {
  const now = new Date();
  await prisma.activityAggregationCursor.upsert({
    where: { id: CURSOR_ID },
    update: { lastRunAt: now, lastError: truncateError(error) },
    create: { id: CURSOR_ID, lastRunAt: now, lastError: truncateError(error) }
  }).catch(() => undefined);
}

export async function processActivityAggregationBatch(batchSize = env.activityAggregationBatchSize) {
  const limit = Math.max(1, Math.min(Math.floor(batchSize) || 500, 500));
  return prisma.$transaction(async (tx) => {
    // Serialize workers across processes. Marking each row in the same transaction
    // avoids both double counting and skipping an older transaction that commits late.
    await acquireActivityAggregationLock(tx);
    const rows = await tx.userAnswer.findMany({
      where: { activityAggregatedAt: null },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: limit,
      select: { id: true, userId: true, createdAt: true, isCorrect: true, durationSeconds: true }
    });
    const now = new Date();
    for (const aggregate of buildActivityAggregatesFromAnswers(rows)) {
      const key = { userId: aggregate.userId, activityDate: aggregate.activityDate };
      const existing = await tx.userDailyActivityStat.findUnique({ where: { userId_activityDate: key } });
      await tx.userDailyActivityStat.upsert({
        where: { userId_activityDate: key },
        update: {
          answerCount: { increment: aggregate.answerCount },
          correctCount: { increment: aggregate.correctCount },
          durationSeconds: { increment: aggregate.durationSeconds },
          firstAnsweredAt: existing?.firstAnsweredAt && existing.firstAnsweredAt < aggregate.firstAnsweredAt
            ? existing.firstAnsweredAt : aggregate.firstAnsweredAt,
          lastAnsweredAt: existing?.lastAnsweredAt && existing.lastAnsweredAt > aggregate.lastAnsweredAt
            ? existing.lastAnsweredAt : aggregate.lastAnsweredAt
        },
        create: aggregate
      });
    }
    // Unique primary-key writes avoid range/gap locks on the unprocessed index.
    // A bulk update with activityAggregatedAt=null can block an earlier uncommitted insert.
    for (const row of rows) await tx.userAnswer.update({
      where: { id: row.id }, data: { activityAggregatedAt: now }
    });
    const last = rows[rows.length - 1];
    await tx.activityAggregationCursor.update({
      where: { id: CURSOR_ID },
      data: {
        ...(last ? { lastAnswerCreatedAt: last.createdAt, lastAnswerId: last.id } : {}),
        processedCount: { increment: rows.length }, lastRunAt: now, lastError: null
      }
    });
    return { processedCount: rows.length, hasMore: rows.length >= limit };
  }, { timeout: 10_000 });
}

async function drainActivityAggregation() {
  const result = await processActivityAggregationBatch();
  processedSinceLastLog += result.processedCount;

  const now = Date.now();
  if (now - lastStatsLogAt >= env.activityAggregationStatsLogIntervalMs) {
    const status = await getActivityAggregationStatus();
    console.log(
      `activity aggregation worker stats: processedSinceLastLog=${processedSinceLastLog}, lagSeconds=${status.lagSeconds ?? 'unknown'}, lastError=${status.lastError || 'none'}`
    );
    lastStatsLogAt = now;
    processedSinceLastLog = 0;
  }

  return result.hasMore;
}

function nextDelayAfterDrain(hasMore: boolean) {
  if (hasMore && consecutiveDrainRounds < env.activityAggregationMaxDrainRounds) {
    consecutiveDrainRounds += 1;
    return 0;
  }
  consecutiveDrainRounds = 0;
  return env.activityAggregationPollMs;
}

export function scheduleActivityAggregationDrain(delayMs = env.activityAggregationPollMs) {
  if (!workerStarted || stopRequested || !shouldUseActivityAggregation()) return;
  const safeDelayMs = Math.max(0, delayMs);
  const dueAt = Date.now() + safeDelayMs;
  if (drainTimer && drainTimerDueAt <= dueAt) return;
  if (drainTimer) clearTimeout(drainTimer);

  drainTimerDueAt = dueAt;
  drainTimer = setTimeout(() => {
    drainTimer = null;
    drainTimerDueAt = 0;
    if (drainPromise) return;

    drainPromise = drainActivityAggregation()
      .then((hasMore) => {
        drainPromise = null;
        if (!stopRequested) scheduleActivityAggregationDrain(nextDelayAfterDrain(hasMore));
        return hasMore;
      })
      .catch(async (error) => {
        drainPromise = null;
        consecutiveDrainRounds = 0;
        await markAggregationFailure(error);
        console.error(`Activity aggregation drain failed: ${truncateError(error)}`);
        if (!stopRequested) scheduleActivityAggregationDrain(env.activityAggregationPollMs);
        return false;
      });
  }, safeDelayMs);
  drainTimer.unref?.();
}

export function startActivityAggregationWorker() {
  if (workerStarted || !shouldUseActivityAggregation()) return;
  workerStarted = true;
  stopRequested = false;
  console.log(
    `activity aggregation worker started: batch size=${env.activityAggregationBatchSize}, poll interval=${env.activityAggregationPollMs}ms, max drain rounds=${env.activityAggregationMaxDrainRounds}`
  );
  scheduleActivityAggregationDrain(0);
}

export async function stopActivityAggregationWorker() {
  stopRequested = true;
  if (drainTimer) {
    clearTimeout(drainTimer);
    drainTimer = null;
    drainTimerDueAt = 0;
  }
  if (drainPromise) await drainPromise;
  workerStarted = false;
}

export async function getActivityAggregationStatus(now = new Date()) {
  const cursor = await readCursor();
  const lastRunAt = cursor?.lastRunAt || null;
  return {
    generatedAt: (lastRunAt || now).toISOString(),
    lagSeconds: lastRunAt ? Math.max(0, Math.round((now.getTime() - lastRunAt.getTime()) / 1000)) : null,
    lastRunAt: lastRunAt ? lastRunAt.toISOString() : null,
    lastAnswerCreatedAt: cursor?.lastAnswerCreatedAt ? cursor.lastAnswerCreatedAt.toISOString() : null,
    lastError: cursor?.lastError || null,
    processedCount: cursor?.processedCount || 0,
    worker: {
      started: workerStarted,
      enabled: env.activityAggregationEnabled,
      batchSize: env.activityAggregationBatchSize,
      pollMs: env.activityAggregationPollMs
    }
  };
}
