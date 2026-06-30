import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import {
  dedupePendingAnswerRecords,
  enqueuePendingAnswer,
  isPendingAnswerDue,
  nextPendingRetryDelayMs,
  pendingAnswerQueueKey,
  readPendingAnswerQueue,
  removePendingAnswer,
  resetAuthFailedPendingAnswers,
  retryDelayMs,
  selectDuePendingAnswers,
  summarizePendingAnswerQueue,
  updatePendingAnswer,
  type PendingAnswerRecord,
  type QueueStorage
} from '../src/utils/pendingAnswerQueue';

class MemoryStorage implements QueueStorage {
  data = new Map<string, string>();

  getItem(key: string) {
    return this.data.get(key) || null;
  }

  setItem(key: string, value: string) {
    this.data.set(key, value);
  }

  removeItem(key: string) {
    this.data.delete(key);
  }
}

class ThrowingStorage implements QueueStorage {
  getItem() {
    throw new Error('storage unavailable');
  }

  setItem() {
    throw new Error('storage unavailable');
  }

  removeItem() {
    throw new Error('storage unavailable');
  }
}

function pendingRecord(overrides: Partial<PendingAnswerRecord> = {}): PendingAnswerRecord {
  return {
    clientAnswerId: 'question-1:client-1',
    questionId: 'question-1',
    selectedAnswer: ['A'],
    isCorrect: true,
    answeredAt: '2026-06-16T00:00:00.000Z',
    retryCount: 0,
    lastTriedAt: '',
    status: 'pending',
    durationSeconds: 2,
    ...overrides
  };
}

test('pending answer queue is isolated per user and persists in storage', () => {
  const storage = new MemoryStorage();
  enqueuePendingAnswer('user-a', pendingRecord(), storage);
  enqueuePendingAnswer('user-b', pendingRecord({ clientAnswerId: 'question-2:client-1', questionId: 'question-2' }), storage);

  assert.equal(readPendingAnswerQueue('user-a', storage).length, 1);
  assert.equal(readPendingAnswerQueue('user-b', storage).length, 1);
  assert.equal(readPendingAnswerQueue('user-a', storage)[0].questionId, 'question-1');
  assert.ok(storage.getItem(pendingAnswerQueueKey('user-a'))?.includes('question-1:client-1'));
});

test('pending answer queue preserves local answer result snapshots for batched sync', () => {
  const storage = new MemoryStorage();
  enqueuePendingAnswer('user-a', pendingRecord({
    answer: ['A'],
    explanation: '解析内容'
  }), storage);

  const [record] = readPendingAnswerQueue('user-a', storage);
  assert.deepEqual(record.answer, ['A']);
  assert.equal(record.explanation, '解析内容');
});

test('same clientAnswerId keeps the latest pending answer', () => {
  const storage = new MemoryStorage();
  enqueuePendingAnswer('user-a', pendingRecord({ selectedAnswer: ['A'] }), storage);
  enqueuePendingAnswer('user-a', pendingRecord({ selectedAnswer: ['B'] }), storage);

  const records = readPendingAnswerQueue('user-a', storage);
  assert.equal(records.length, 1);
  assert.deepEqual(records[0].selectedAnswer, ['B']);
  assert.equal(records[0].clientAnswerId, 'question-1:client-1');
});

test('same session question collapses short duplicate submissions to the latest answer', () => {
  const storage = new MemoryStorage();
  enqueuePendingAnswer('user-a', pendingRecord({
    clientAnswerId: 'q1:first',
    sessionKey: 'session-a',
    selectedAnswer: ['A'],
    answeredAt: '2026-06-16T00:00:00.000Z'
  }), storage);
  enqueuePendingAnswer('user-a', pendingRecord({
    clientAnswerId: 'q1:last',
    sessionKey: 'session-a',
    selectedAnswer: ['B'],
    answeredAt: '2026-06-16T00:00:05.000Z'
  }), storage);

  const records = readPendingAnswerQueue('user-a', storage);
  assert.equal(records.length, 1);
  assert.equal(records[0].clientAnswerId, 'q1:last');
  assert.deepEqual(records[0].selectedAnswer, ['B']);
});

test('same practiceSessionId question always keeps the latest answer', () => {
  const storage = new MemoryStorage();
  enqueuePendingAnswer('user-a', pendingRecord({
    clientAnswerId: 'q1:first',
    practiceSessionId: 'practice-session-a',
    selectedAnswer: ['A'],
    answeredAt: '2026-06-16T00:00:00.000Z'
  }), storage);
  enqueuePendingAnswer('user-a', pendingRecord({
    clientAnswerId: 'q1:last',
    practiceSessionId: 'practice-session-a',
    selectedAnswer: ['B'],
    answeredAt: '2026-06-16T00:20:00.000Z'
  }), storage);

  const records = readPendingAnswerQueue('user-a', storage);
  assert.equal(records.length, 1);
  assert.equal(records[0].practiceSessionId, 'practice-session-a');
  assert.equal(records[0].clientAnswerId, 'q1:last');
  assert.deepEqual(records[0].selectedAnswer, ['B']);
});

test('batch dedupe keeps one record per clientAnswerId and per session question', () => {
  const records = dedupePendingAnswerRecords([
    pendingRecord({ clientAnswerId: 'q1:first', sessionKey: 'session-a', selectedAnswer: ['A'], answeredAt: '2026-06-16T00:00:00.000Z' }),
    pendingRecord({ clientAnswerId: 'q1:first', sessionKey: 'session-a', selectedAnswer: ['B'], answeredAt: '2026-06-16T00:00:01.000Z' }),
    pendingRecord({ clientAnswerId: 'q1:last', sessionKey: 'session-a', selectedAnswer: ['C'], answeredAt: '2026-06-16T00:00:02.000Z' }),
    pendingRecord({ clientAnswerId: 'q2:other', questionId: 'question-2', sessionKey: 'session-a', selectedAnswer: ['D'], answeredAt: '2026-06-16T00:00:03.000Z' })
  ]);

  assert.deepEqual(records.map((record) => [record.clientAnswerId, record.selectedAnswer]), [
    ['q1:last', ['C']],
    ['q2:other', ['D']]
  ]);
});

test('practice view submits pending answers only from explicit finish flow', () => {
  const source = readFileSync(new URL('../src/views/PracticeView.vue', import.meta.url), 'utf8');
  const submitAnswerBody = source.match(/function submitAnswer\(\) \{[\s\S]*?\n\}/)?.[0] || '';
  const confirmOptionBody = source.match(/function confirmOption\(key: string\) \{[\s\S]*?\n\}/)?.[0] || '';

  assert.match(source, /practiceSessionId/);
  assert.match(source, /submitCurrentPracticeSession/);
  assert.match(source, /clientSubmissionId/);
  assert.match(source, /提交失败，答案已暂存在本机，请稍后重试/);
  assert.doesNotMatch(submitAnswerBody, /schedulePendingAnswerRetry/);
  assert.doesNotMatch(confirmOptionBody, /submitAnswer\(\)/);
  assert.doesNotMatch(source, /window\.addEventListener\('online', handlePendingAnswerOnline\)/);
});

test('successful sync removes the pending answer', () => {
  const storage = new MemoryStorage();
  enqueuePendingAnswer('user-a', pendingRecord(), storage);
  removePendingAnswer('user-a', 'question-1:client-1', storage);

  assert.deepEqual(readPendingAnswerQueue('user-a', storage), []);
  assert.equal(storage.getItem(pendingAnswerQueueKey('user-a')), null);
});

test('retry backoff selects due records without blocking later records', () => {
  const storage = new MemoryStorage();
  const now = Date.parse('2026-06-16T00:00:10.000Z');
  enqueuePendingAnswer('user-a', pendingRecord({
    clientAnswerId: 'q1:stale',
    questionId: 'q1',
    retryCount: 3,
    lastTriedAt: '2026-06-16T00:00:04.000Z',
    status: 'failed'
  }), storage);
  enqueuePendingAnswer('user-a', pendingRecord({
    clientAnswerId: 'q2:recent',
    questionId: 'q2',
    retryCount: 3,
    lastTriedAt: '2026-06-16T00:00:08.000Z',
    status: 'failed'
  }), storage);

  assert.equal(retryDelayMs(readPendingAnswerQueue('user-a', storage)[0]), 5000);
  assert.deepEqual(selectDuePendingAnswers('user-a', now, storage).map((record) => record.clientAnswerId), ['q1:stale']);
  assert.equal(nextPendingRetryDelayMs('user-a', now, storage), 0);
});

test('auth failures and invalid answers are kept but excluded from automatic retry', () => {
  const storage = new MemoryStorage();
  enqueuePendingAnswer('user-a', pendingRecord({ clientAnswerId: 'q1:auth', status: 'auth_failed', lastStatusCode: 401 }), storage);
  enqueuePendingAnswer('user-a', pendingRecord({ clientAnswerId: 'q2:invalid', questionId: 'q2', status: 'invalid', lastStatusCode: 400 }), storage);

  const records = readPendingAnswerQueue('user-a', storage);
  assert.equal(isPendingAnswerDue(records[0], Date.now()), false);
  assert.equal(isPendingAnswerDue(records[1], Date.now()), false);
  assert.deepEqual(summarizePendingAnswerQueue('user-a', storage), {
    total: 1,
    retryable: 0,
    syncing: 0,
    authFailed: 1,
    invalid: 1
  });
});

test('auth failed answers can retry after login refresh', () => {
  const storage = new MemoryStorage();
  enqueuePendingAnswer('user-a', pendingRecord({ status: 'auth_failed', retryCount: 1, lastStatusCode: 401 }), storage);
  resetAuthFailedPendingAnswers('user-a', storage);

  const [record] = readPendingAnswerQueue('user-a', storage);
  assert.equal(record.status, 'pending');
  assert.equal(record.lastStatusCode, undefined);
});

test('stale syncing answers become retryable after a page refresh', () => {
  const storage = new MemoryStorage();
  enqueuePendingAnswer('user-a', pendingRecord({
    status: 'syncing',
    retryCount: 1,
    lastTriedAt: '2026-06-16T00:00:00.000Z'
  }), storage);

  assert.equal(selectDuePendingAnswers('user-a', Date.parse('2026-06-16T00:00:10.000Z'), storage).length, 0);
  assert.equal(selectDuePendingAnswers('user-a', Date.parse('2026-06-16T00:00:31.000Z'), storage).length, 1);
});

test('status updates keep clientAnswerId stable across retries', () => {
  const storage = new MemoryStorage();
  enqueuePendingAnswer('user-a', pendingRecord(), storage);
  updatePendingAnswer('user-a', 'question-1:client-1', (record) => ({
    ...record,
    status: 'failed',
    retryCount: record.retryCount + 1,
    lastTriedAt: '2026-06-16T00:00:01.000Z'
  }), storage);

  const [record] = readPendingAnswerQueue('user-a', storage);
  assert.equal(record.clientAnswerId, 'question-1:client-1');
  assert.equal(record.retryCount, 1);
  assert.equal(record.status, 'failed');
});

test('queue keeps a same-page fallback when localStorage is unavailable', () => {
  const storage = new ThrowingStorage();
  const userKey = `storage-fallback-${Date.now()}`;
  enqueuePendingAnswer(userKey, pendingRecord(), storage);

  const records = readPendingAnswerQueue(userKey, null);
  assert.equal(records.length, 1);
  assert.equal(records[0].clientAnswerId, 'question-1:client-1');
});

test('practice view batches pending answer sync and keeps local pending records on batch failure', () => {
  const source = readFileSync(new URL('../src/views/PracticeView.vue', import.meta.url), 'utf8');

  assert.match(source, /\/practice\/answers\/batch/);
  assert.match(source, /PENDING_ANSWER_SYNC_BATCH_SIZE = 20/);
  assert.match(source, /dedupePendingAnswerRecords/);
  assert.match(source, /uniqueRecords\.map\(pendingAnswerPayload\)/);
  assert.match(source, /catch \(error\) \{[\s\S]*markPendingAnswerSyncError/);
  assert.doesNotMatch(
    source.match(/async function syncPendingAnswerBatch[\s\S]*?async function syncPendingAnswerSingle/)?.[0] || '',
    /catch \(error\) \{[\s\S]*removePendingAnswer/
  );
});
