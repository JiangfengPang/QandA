import assert from 'node:assert/strict';
import test from 'node:test';
import type { TestContext } from 'node:test';
import { prisma } from '../db/prisma.js';
import { env } from '../config/env.js';
import { HttpError } from '../utils/http.js';
import { enqueuePracticeAnswerSessionSubmission, markSessionQueueItemProcessed, markSessionQueueItemFailed, waitForPracticeAnswersForUser } from './practiceAnswerQueueService.js';
import { invalidateSystemControlsCache } from './systemControlService.js';

const answer = (id: string) => ({ questionId: `q-${id}`, clientAnswerId: `a-${id}`, selected: ['A'], durationSeconds: 1 });
const input = (id: string) => ({ practiceSessionId: 'session', clientSubmissionId: `submit-${id}`, answers: [answer(id)] });

function stub(t: TestContext, target: any, key: string, implementation: (...args: any[]) => any) {
  const original = target[key];
  target[key] = implementation;
  t.after(() => { target[key] = original; });
  return implementation;
}

function harness(t: TestContext, startEmpty = false) {
  env.practiceAnswerQueueEnabled = true;
  let row: any = startEmpty ? null : { id: 'job', userId: 'user', practiceSessionId: 'session',
    clientSubmissionId: 'submit-0', answersJson: [answer('0')], payloadVersion: 1,
    status: 'pending', retryCount: 0, lockedAt: null };
  const sessionWrites: any[] = [];
  stub(t, prisma, '$transaction', async (callback: any) => callback(prisma));
  stub(t, prisma.practiceSession, 'upsert', async () => ({ id: 'session', userId: 'user' }));
  stub(t, prisma.practiceSession, 'update', async (args: any) => { sessionWrites.push(args.data); return args.data; });
  stub(t, prisma.practiceAnswerSubmissionQueue, 'findUnique', async (args: any) => {
    if (args.where.userId_clientSubmissionId) return row?.clientSubmissionId === args.where.userId_clientSubmissionId.clientSubmissionId ? structuredClone(row) : null;
    return structuredClone(row);
  });
  stub(t, prisma.practiceAnswerSubmissionQueue, 'create', async (args: any) => {
    if (row) throw Object.assign(new Error('duplicate'), { code: 'P2002' });
    row = { id: 'job', ...args.data, payloadVersion: 1, lockedAt: null };
    return structuredClone(row);
  });
  stub(t, prisma.practiceAnswerSubmissionQueue, 'updateMany', async (args: any) => {
    const { where, data } = args;
    if (!row || row.id !== where.id || (where.status && row.status !== where.status)) return { count: 0 };
    if (where.lockedAt !== undefined && row.lockedAt?.getTime() !== where.lockedAt?.getTime()) return { count: 0 };
    if (typeof where.payloadVersion === 'number' && row.payloadVersion !== where.payloadVersion) return { count: 0 };
    if (where.payloadVersion?.not !== undefined && row.payloadVersion === where.payloadVersion.not) return { count: 0 };
    const version = row.payloadVersion;
    Object.assign(row, data);
    if (data.payloadVersion?.increment) row.payloadVersion = version + data.payloadVersion.increment;
    return { count: 1 };
  });
  return { get row() { return row; }, sessionWrites };
}

test('simultaneous appends retain every accepted answer', async (t) => {
  const h = harness(t);
  let reads = 0;
  let release!: () => void;
  const barrier = new Promise<void>((resolve) => { release = resolve; });
  stub(t, prisma.practiceAnswerSubmissionQueue, 'findUnique', async (args: any) => {
    if (args.where.userId_clientSubmissionId) return null;
    const snapshot = structuredClone(h.row);
    reads += 1;
    if (reads <= 2) { if (reads === 2) release(); await barrier; }
    return snapshot;
  });
  const results = await Promise.all([enqueuePracticeAnswerSessionSubmission('user', input('1')), enqueuePracticeAnswerSessionSubmission('user', input('2'))]);
  assert.deepEqual(results.map((r) => r.accepted), [1, 1]);
  assert.deepEqual(h.row.answersJson.map((a: any) => a.questionId).sort(), ['q-0', 'q-1', 'q-2']);
  assert.equal(h.row.payloadVersion, 3);
});

test('simultaneous first submissions recover from unique-key creation races', async (t) => {
  const h = harness(t, true);
  await Promise.all([enqueuePracticeAnswerSessionSubmission('user', input('1')), enqueuePracticeAnswerSessionSubmission('user', input('2'))]);
  assert.deepEqual(h.row.answersJson.map((a: any) => a.questionId).sort(), ['q-1', 'q-2']);
});

test('identical retries do not reopen a completed payload', async (t) => {
  const h = harness(t);
  h.row.status = 'processed';
  const result = await enqueuePracticeAnswerSessionSubmission('user', input('0'));
  assert.equal(result.submissionStatus, 'processed');
  assert.equal(h.row.payloadVersion, 1);
  assert.equal(h.sessionWrites.length, 0);
});

test('a new payload arriving at completion remains retryable and cannot finalize the session', async (t) => {
  const h = harness(t);
  h.row.status = 'processing';
  h.row.lockedAt = new Date();
  const item = structuredClone(h.row);
  const update = prisma.practiceAnswerSubmissionQueue.updateMany;
  let first = true;
  stub(t, prisma.practiceAnswerSubmissionQueue, 'updateMany', async (args: any) => {
    if (first) { first = false; h.row.payloadVersion += 1; h.row.answersJson.push(answer('1')); }
    return update(args);
  });
  assert.equal(await markSessionQueueItemProcessed(item, { answerCount: 1, correctCount: 1, durationSeconds: 1 }), false);
  assert.equal(h.row.status, 'retrying');
  assert.equal(h.row.payloadVersion, 2);
  assert.equal(h.sessionWrites.length, 0);
});

test('an expired worker cannot complete or fail a newer lease', async (t) => {
  const h = harness(t);
  h.row.status = 'processing';
  h.row.lockedAt = new Date('2026-10-07T01:00:00Z');
  const item = structuredClone(h.row);
  h.row.lockedAt = new Date('2026-10-07T01:02:01Z');
  assert.equal(await markSessionQueueItemProcessed(item, { answerCount: 1, correctCount: 1, durationSeconds: 1 }), false);
  await markSessionQueueItemFailed(item, new HttpError('bad old payload', 400));
  assert.equal(h.row.status, 'processing');
  assert.equal(h.sessionWrites.length, 0);
});

test('an error in an older payload cannot permanently fail an appended payload', async (t) => {
  const h = harness(t);
  h.row.status = 'processing'; h.row.lockedAt = new Date();
  const item = structuredClone(h.row);
  h.row.payloadVersion += 1;
  await markSessionQueueItemFailed(item, new HttpError('bad old answer', 400));
  assert.equal(h.row.status, 'retrying');
  assert.equal(h.row.retryCount, 0);
  assert.equal(h.sessionWrites.length, 0);
});

test('completed payload and summary are confirmed together', async (t) => {
  const h = harness(t);
  h.row.status = 'processing'; h.row.lockedAt = new Date();
  assert.equal(await markSessionQueueItemProcessed(structuredClone(h.row), { answerCount: 1, correctCount: 1, durationSeconds: 1 }), true);
  assert.equal(h.row.status, 'processed');
  assert.equal(h.row.processedPayloadVersion, h.row.payloadVersion);
  assert.equal(h.sessionWrites[0].status, 'submitted');
});

test('statistics reads have a bounded wait while background processing remains pending', async (t) => {
  harness(t);
  invalidateSystemControlsCache();
  stub(t, prisma.systemSetting, 'findUnique', async () => null);
  stub(t, prisma.practiceAnswerSubmissionQueue, 'updateMany', async () => ({ count: 0 }));
  stub(t, prisma.practiceAnswerQueueItem, 'updateMany', async () => ({ count: 0 }));
  let release!: () => void;
  const pending = new Promise<any[]>((resolve) => { release = () => resolve([]); });
  stub(t, prisma.practiceAnswerSubmissionQueue, 'findMany', () => pending);
  stub(t, prisma.practiceAnswerQueueItem, 'findMany', () => pending);
  const start = Date.now();
  await waitForPracticeAnswersForUser('bounded-wait-test', 20);
  assert.ok(Date.now() - start < 500);
  release();
});
