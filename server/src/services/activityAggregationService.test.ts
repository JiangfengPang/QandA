import assert from 'node:assert/strict';
import test from 'node:test';
import type { TestContext } from 'node:test';
import { prisma } from '../db/prisma.js';
import { processActivityAggregationBatch } from './activityAggregationService.js';
import { getAdminActivityDetail, invalidateAdminActivityCaches } from './adminAnalyticsService.js';
import { invalidateSystemControlsCache } from './systemControlService.js';
import { clearPracticeRecords, submitPracticeAnswer } from './practiceRecordService.js';

function stub(t: TestContext, target: any, key: string, implementation: (...args: any[]) => any) {
  const original = target[key];
  target[key] = implementation;
  t.after(() => { target[key] = original; });
  return implementation;
}

function aggregationHarness(t: TestContext) {
  const answers: any[] = [];
  const stats = new Map<string, any>();
  let lockTail = Promise.resolve();
  stub(t, prisma, '$transaction', async (callback: any) => {
    let unlock: (() => void) | undefined;
    const tx = {
      $executeRaw: async () => 1,
      $queryRaw: async () => {
        const previous = lockTail;
        lockTail = new Promise<void>((resolve) => { unlock = resolve; });
        await previous;
        return [{ id: 'default' }];
      },
      userAnswer: {
        findMany: async ({ take }: any) => structuredClone(answers.filter((a) => !a.activityAggregatedAt).slice(0, take)),
        update: async ({ where, data }: any) => {
          const answer = answers.find((item) => item.id === where.id);
          Object.assign(answer, data);
          return answer;
        },
        deleteMany: async ({ where }: any) => { for (let i = answers.length - 1; i >= 0; i--) if (answers[i].userId === where.userId) answers.splice(i, 1); }
      },
      userDailyActivityStat: {
        findUnique: async ({ where }: any) => stats.get(where.userId_activityDate.userId) || null,
        upsert: async ({ where, create, update }: any) => {
          const key = where.userId_activityDate.userId;
          const current = stats.get(key);
          if (!current) stats.set(key, structuredClone(create));
          else for (const [key, value] of Object.entries(update)) current[key] = (value as any)?.increment !== undefined ? current[key] + (value as any).increment : value;
        },
        deleteMany: async ({ where }: any) => { stats.delete(where.userId); }
      },
      activityAggregationCursor: { update: async () => ({}) },
      practiceAnswerSubmissionQueue: { deleteMany: async () => ({}) },
      practiceAnswerQueueItem: { deleteMany: async () => ({}) },
      practiceSession: { deleteMany: async () => ({}) },
      userPracticeSession: { deleteMany: async () => ({}) },
      wrongQuestion: { deleteMany: async () => ({}) },
      userFavorite: { deleteMany: async () => ({}) }
    };
    try { return await callback(tx); } finally { unlock?.(); }
  });
  const add = (id: string, createdAt: string) => answers.push({ id, userId: 'student', createdAt: new Date(createdAt), isCorrect: true, durationSeconds: 2, activityAggregatedAt: null });
  return { answers, stats, add };
}

test('late committed earlier answers are counted once and preserve first/last times', async (t) => {
  const h = aggregationHarness(t);
  h.add('later', '2026-10-07T04:00:00Z');
  assert.equal((await processActivityAggregationBatch()).processedCount, 1);
  h.add('earlier', '2026-10-07T03:00:00Z');
  assert.equal((await processActivityAggregationBatch()).processedCount, 1);
  assert.equal((await processActivityAggregationBatch()).processedCount, 0);
  const stat = h.stats.get('student');
  assert.equal(stat.answerCount, 2);
  assert.equal(stat.durationSeconds, 4);
  assert.equal(stat.firstAnsweredAt.toISOString(), '2026-10-07T03:00:00.000Z');
  assert.equal(stat.lastAnsweredAt.toISOString(), '2026-10-07T04:00:00.000Z');
});

test('two workers use the transaction lock and do not double count', async (t) => {
  const h = aggregationHarness(t);
  h.add('one', '2026-10-07T03:00:00Z');
  const results = await Promise.all([processActivityAggregationBatch(), processActivityAggregationBatch()]);
  assert.equal(results.reduce((sum, result) => sum + result.processedCount, 0), 1);
  assert.equal(h.stats.get('student').answerCount, 1);
});

test('clearing records clears derived totals and later batches cannot recreate them', async (t) => {
  const h = aggregationHarness(t);
  h.add('one', '2026-10-07T03:00:00Z');
  await processActivityAggregationBatch();
  await clearPracticeRecords('student');
  assert.equal(h.answers.length, 0);
  assert.equal(h.stats.size, 0);
  await processActivityAggregationBatch();
  assert.equal(h.stats.size, 0);
});

test('a cleared or expired queued job cannot write an answer', async (t) => {
  stub(t, prisma.question, 'findFirst', async () => ({ id: 'q1', type: 'single', options: [{ label: 'A' }], answerJson: ['A'], explanation: '' }));
  stub(t, prisma.user, 'findUnique', async () => ({ autoAddWrong: true }));
  let writes = 0;
  stub(t, prisma, '$transaction', async (callback: any) => callback({
    $queryRaw: async () => [], userAnswer: { create: async () => { writes++; } }
  }));
  await assert.rejects(submitPracticeAnswer('student', 'q1', ['A'], 1, 'a1', { kind: 'session', id: 'removed-job', lockedAt: new Date() }), /已更新或清除/);
  assert.equal(writes, 0);
});

test('7 and 30 day detail calls query and cache the corresponding range', async (t) => {
  invalidateSystemControlsCache(); invalidateAdminActivityCaches();
  stub(t, prisma.systemSetting, 'findUnique', async () => null);
  stub(t, prisma.userPresenceSession, 'findMany', async () => []);
  stub(t, prisma, '$queryRaw', async () => []);
  stub(t, prisma.activityAggregationCursor, 'findUnique', async () => null);
  let queries = 0;
  stub(t, prisma.userDailyActivityStat, 'findMany', async () => { queries++; return []; });
  const seven = await getAdminActivityDetail(7);
  const thirty = await getAdminActivityDetail(30);
  assert.equal(seven.days, 7); assert.equal(thirty.days, 30);
  assert.equal(queries, 2);
  await getAdminActivityDetail(30);
  assert.equal(queries, 2);
});
