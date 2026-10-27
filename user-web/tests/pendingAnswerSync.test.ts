import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPendingAnswerChunks, postPendingAnswerSessionKeepalive, syncPendingAnswerSessions, PENDING_ANSWER_KEEPALIVE_BYTES } from '../src/utils/pendingAnswerSync';
import { enqueuePendingAnswer, readPendingAnswerQueue, clearPendingAnswerQueue, writePendingAnswerQueue, type PendingAnswerRecord } from '../src/utils/pendingAnswerQueue';

function record(index: number, selected = 'A'): PendingAnswerRecord {
  return { clientAnswerId: `a-${index}`, questionId: `q-${index}`, practiceSessionId: 'session',
    selectedAnswer: [selected], isCorrect: true, answer: ['A'], explanation: '解析'.repeat(10000),
    answeredAt: '2026-10-07T00:00:00.000Z', retryCount: 0, lastTriedAt: '', status: 'pending' };
}

test('501 answers split into valid compact batches', () => {
  const chunks = buildPendingAnswerChunks(Array.from({ length: 501 }, (_, i) => record(i)));
  assert.deepEqual(chunks.map((chunk) => chunk.records.length), [500, 1]);
  assert.equal(new Set(chunks.map((chunk) => chunk.payload.clientSubmissionId)).size, 2);
  assert.equal('explanation' in chunks[0].payload.answers[0], false);
});

test('batch byte limits measure Unicode UTF-8 bytes', () => {
  const chunks = buildPendingAnswerChunks(Array.from({ length: 10 }, (_, i) => record(i, '汉'.repeat(5000))), {}, 40000);
  assert.equal(chunks.flatMap((chunk) => chunk.records).length, 10);
  for (const chunk of chunks) assert.ok(new TextEncoder().encode(JSON.stringify(chunk.payload)).byteLength <= 40000);
});

test('a failed later chunk retains only unacknowledged answers', async (t) => {
  const user = 'partial-failure-regression';
  const records = Array.from({ length: 501 }, (_, i) => record(i));
  writePendingAnswerQueue(user, records, null);
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    calls += 1;
    const payload = JSON.parse(String(init?.body));
    if (calls === 2) return new Response(JSON.stringify({ code: 400, message: 'temporary rejection' }), { status: 400 });
    return new Response(JSON.stringify({ code: 0, data: { accepted: payload.answers.length, results: [] } }));
  });
  await assert.rejects(syncPendingAnswerSessions(user, records), /temporary rejection/);
  assert.equal(calls, 2);
  assert.deepEqual(readPendingAnswerQueue(user, null).map((row) => row.clientAnswerId), ['a-500']);
});

test('keepalive sends one bounded request and retains every answer for retry', (t) => {
  const records = Array.from({ length: 501 }, (_, i) => record(i, '汉'.repeat(1000)));
  const user = 'keepalive-regression';
  writePendingAnswerQueue(user, records, null);
  const requests: RequestInit[] = [];
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    requests.push(init!);
    return new Response('{}');
  });
  assert.equal(postPendingAnswerSessionKeepalive(records), true);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].keepalive, true);
  assert.ok(new TextEncoder().encode(String(requests[0].body)).byteLength <= PENDING_ANSWER_KEEPALIVE_BYTES);
  assert.equal(readPendingAnswerQueue(user, null).length, 501);
});

test('quota failure overrides stale readable storage, failed clear keeps a tombstone, and persistence recovers', () => {
  const user = 'quota-regression';
  let raw: string | null = null;
  let fail = true;
  const storage = {
    getItem: () => raw,
    setItem: (_key: string, value: string) => { if (fail) throw new Error('quota exceeded'); raw = value; },
    removeItem: () => { if (fail) throw new Error('remove denied'); raw = null; }
  };
  enqueuePendingAnswer(user, record(1), storage);
  assert.equal(readPendingAnswerQueue(user, storage).length, 1);
  fail = false;
  enqueuePendingAnswer(user, record(2), storage);
  assert.equal(JSON.parse(raw!).length, 2);
  fail = true;
  enqueuePendingAnswer(user, record(3), storage);
  assert.equal(readPendingAnswerQueue(user, storage).length, 3);
  clearPendingAnswerQueue(user, storage);
  assert.equal(readPendingAnswerQueue(user, storage).length, 0);
  assert.equal(JSON.parse(raw!).length, 2);
  fail = false;
  enqueuePendingAnswer(user, record(4), storage);
  assert.deepEqual(JSON.parse(raw!).map((row: PendingAnswerRecord) => row.clientAnswerId), ['a-4']);
});

test('denied access to the localStorage getter falls back to memory', (t) => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get: () => { throw new Error('security error'); } });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  });
  enqueuePendingAnswer('security-regression', record(1));
  assert.equal(readPendingAnswerQueue('security-regression').length, 1);
});

test('unload requests share a byte budget and release it when fetch completes', async (t) => {
  const { postKeepalive, request } = await import('../src/api/request');
  let finish!: () => void;
  let calls = 0;
  t.mock.method(globalThis, 'fetch', () => {
    calls++;
    return new Promise<Response>((resolve) => { finish = () => resolve(new Response('{}')); });
  });
  assert.equal(postKeepalive('/test', { data: '汉'.repeat(19000) }), true);
  assert.equal(postKeepalive('/test', { data: '汉'.repeat(2000) }), false);
  await assert.rejects(request('/test', { method: 'PUT', keepalive: true, body: '汉'.repeat(2000) }), /容量已满/);
  assert.equal(calls, 1);
  finish();
  await new Promise((resolve) => setTimeout(resolve, 0));
  t.mock.method(globalThis, 'fetch', async () => new Response('{}'));
  assert.equal(postKeepalive('/test', { data: '汉'.repeat(2000) }), true);
});
