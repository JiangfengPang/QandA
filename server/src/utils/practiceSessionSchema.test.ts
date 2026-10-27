import assert from 'node:assert/strict';
import test from 'node:test';
import { sessionSnapshotSchema } from './practiceSessionSchema.js';
import { savePracticeResume } from '../../../user-web/src/utils/practiceResume.js';

test('the actual frontend resume payload passes the server contract', () => {
  const snapshot = savePracticeResume('key', [{ id: 'q1' }], 0, {
    q1: { correct: true, userAnswer: ['A'], answer: ['A'], explanation: '解析', clientAnswerId: 'a1', syncStatus: 'pending' }
  }, { practiceSessionId: 'session', scope: 'bank:1', submitted: false }, {
    getItem: () => null, setItem: () => {}, removeItem: () => {}
  });
  assert.ok(snapshot);
  assert.deepEqual(sessionSnapshotSchema.parse(snapshot), snapshot);
});

test('legacy resumes remain valid and malformed or unknown fields are rejected', () => {
  const old = { version: 1, currentIndex: 0, questionId: 'q1', questionIds: ['q1'] };
  assert.equal(sessionSnapshotSchema.safeParse(old).success, true);
  assert.equal(sessionSnapshotSchema.safeParse({ ...old, currentIndex: 1 }).success, false);
  assert.equal(sessionSnapshotSchema.safeParse({ ...old, submitted: 'false' }).success, false);
  assert.equal(sessionSnapshotSchema.safeParse({ ...old, extra: true }).success, false);
});
