import { Prisma } from '@prisma/client';
import { env } from '../config/env.js';
import { prisma } from '../db/prisma.js';
import { dayKey, dayStart } from '../utils/date.js';

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
    const activityDate = dayStart(row.createdAt);
    const key = `${row.userId}:${dayKey(activityDate)}`;
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

function answerCursorWhere(cursor: Awaited<ReturnType<typeof readCursor>>): Prisma.UserAnswerWhereInput {
  if (!cursor?.lastAnswerCreatedAt || !cursor.lastAnswerId) return {};
  return {
    OR: [
      { createdAt: { gt: cursor.lastAnswerCreatedAt } },
      { createdAt: cursor.lastAnswerCreatedAt, id: { gt: cursor.lastAnswerId } }
    ]
  };
}

async function markAggregationRunWithoutRows() {
  const now = new Date();
  await prisma.activityAggregationCursor.upsert({
    where: { id: CURSOR_ID },
    update: { lastRunAt: now, lastError: null },
    create: { id: CURSOR_ID, lastRunAt: now, lastError: null }
  });
}

async function markAggregationFailure(error: unknown) {
  const now = new Date();
  await prisma.activityAggregationCursor.upsert({
    where: { id: CURSOR_ID },
    update: { lastRunAt: now, lastError: truncateError(error) },
    create: { id: CURSOR_ID, lastRunAt: now, lastError: truncateError(error) }
  }).catch(() => undefined);
}

async function applyActivityAggregationBatch(rows: ActivityAnswerRow[]) {
  const aggregates = buildActivityAggregatesFromAnswers(rows);
  const last = rows[rows.length - 1];
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    for (const aggregate of aggregates) {
      await tx.userDailyActivityStat.upsert({
        where: {
          userId_activityDate: {
            userId: aggregate.userId,
            activityDate: aggregate.activityDate
          }
        },
        update: {
          answerCount: { increment: aggregate.answerCount },
          correctCount: { increment: aggregate.correctCount },
          durationSeconds: { increment: aggregate.durationSeconds },
          lastAnsweredAt: aggregate.lastAnsweredAt
        },
        create: aggregate
      });
    }

    await tx.activityAggregationCursor.upsert({
      where: { id: CURSOR_ID },
      update: {
        lastAnswerCreatedAt: last.createdAt,
        lastAnswerId: last.id,
        processedCount: { increment: rows.length },
        lastRunAt: now,
        lastError: null
      },
      create: {
        id: CURSOR_ID,
        lastAnswerCreatedAt: last.createdAt,
        lastAnswerId: last.id,
        processedCount: rows.length,
        lastRunAt: now,
        lastError: null
      }
    });
  }, { timeout: 10_000 });
}

export async function processActivityAggregationBatch(batchSize = env.activityAggregationBatchSize) {
  const cursor = await readCursor();
  const rows = await prisma.userAnswer.findMany({
    where: answerCursorWhere(cursor),
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    take: batchSize,
    select: {
      id: true,
      userId: true,
      createdAt: true,
      isCorrect: true,
      durationSeconds: true
    }
  });

  if (!rows.length) {
    await markAggregationRunWithoutRows();
    return { processedCount: 0, hasMore: false };
  }

  await applyActivityAggregationBatch(rows);
  return { processedCount: rows.length, hasMore: rows.length >= batchSize };
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
