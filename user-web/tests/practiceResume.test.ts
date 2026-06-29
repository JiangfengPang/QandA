import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applySavedPracticeQuestionOrder,
  newerPracticeResume,
  buildPracticeResumeKey,
  clearPracticeResume,
  isPracticeResumeSnapshotComplete,
  practiceResumeUpdatedAt,
  readPracticeResumeSessionRecords,
  readPracticeResume,
  resolvePracticeResumeFirstUnansweredIndex,
  resolvePracticeResumeIndex,
  resolvePracticeResumeRestoreIndex,
  savePracticeResume,
  shouldAskToRestorePracticeResume,
  shouldClearPracticeResumeOnExit,
  shouldSavePracticeResumeSnapshot
} from '../src/utils/practiceResume';

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    }
  };
}

test('practice resume saves and restores the current question by id', () => {
  const storage = memoryStorage();
  const key = buildPracticeResumeKey('user-1', ['practice', 'bank', 'bank-1']);
  const questions = [{ id: 'q1' }, { id: 'q2' }, { id: 'q3' }];

  savePracticeResume(key, questions, 1, undefined, storage);

  assert.equal(readPracticeResume(key, storage)?.questionId, 'q2');
  assert.equal(resolvePracticeResumeIndex(key, questions, storage), 1);
  assert.equal(resolvePracticeResumeIndex(key, [{ id: 'q2' }, { id: 'q3' }], storage), 0);
});

test('practice resume can reuse a saved random question order', () => {
  const storage = memoryStorage();
  const key = buildPracticeResumeKey('user-1', ['practice', 'subject', 'subject-1', 'random']);
  const randomOrder = [{ id: 'q3' }, { id: 'q1' }, { id: 'q2' }];

  savePracticeResume(key, randomOrder, 2, undefined, storage);

  const restored = applySavedPracticeQuestionOrder(key, [{ id: 'q1' }, { id: 'q2' }, { id: 'q3' }, { id: 'q4' }], storage);
  assert.deepEqual(restored?.map((question) => question.id), ['q3', 'q1', 'q2', 'q4']);
  assert.equal(resolvePracticeResumeIndex(key, restored || [], storage), 2);
});

test('practice resume chooses the newest local or remote snapshot', () => {
  const older = {
    version: 1 as const,
    currentIndex: 0,
    questionId: 'q1',
    questionIds: ['q1', 'q2'],
    updatedAt: '2026-06-25T01:00:00.000Z'
  };
  const newer = {
    version: 1 as const,
    currentIndex: 1,
    questionId: 'q2',
    questionIds: ['q1', 'q2'],
    updatedAt: '2026-06-25T02:00:00.000Z'
  };

  assert.equal(newerPracticeResume(older, newer), newer);
  assert.equal(newerPracticeResume(newer, older), newer);
  assert.equal(practiceResumeUpdatedAt(newer) > practiceResumeUpdatedAt(older), true);
});

test('practice resume clear removes saved progress', () => {
  const storage = memoryStorage();
  const key = buildPracticeResumeKey('user-1', ['memorize', 'subject', 'subject-1']);

  savePracticeResume(key, [{ id: 'q1' }, { id: 'q2' }], 1, undefined, storage);
  clearPracticeResume(key, storage);

  assert.equal(readPracticeResume(key, storage), null);
  assert.equal(resolvePracticeResumeIndex(key, [{ id: 'q1' }, { id: 'q2' }], storage), null);
});

test('practice resume is cleared only after all questions are answered', () => {
  assert.equal(shouldClearPracticeResumeOnExit(3, 0), true);
  assert.equal(shouldClearPracticeResumeOnExit(3, 1), false);
  assert.equal(shouldClearPracticeResumeOnExit(0, 0), false);
});

test('practice resume preserves answer card session records', () => {
  const storage = memoryStorage();
  const key = buildPracticeResumeKey('user-1', ['practice', 'bank', 'bank-1']);
  const questions = [{ id: 'q1' }, { id: 'q2' }, { id: 'q3' }];

  savePracticeResume(key, questions, 2, {
    q1: {
      correct: true,
      userAnswer: ['A'],
      answer: ['A'],
      explanation: 'right',
      clientAnswerId: 'q1:a',
      syncStatus: 'synced'
    },
    q2: {
      correct: false,
      userAnswer: ['B'],
      answer: ['C'],
      explanation: 'wrong',
      clientAnswerId: 'q2:b',
      syncStatus: 'pending'
    },
    stale: {
      correct: true,
      userAnswer: ['D'],
      answer: ['D'],
      explanation: ''
    }
  }, storage);

  const records = readPracticeResumeSessionRecords(key, questions, storage);
  assert.deepEqual(Object.keys(records).sort(), ['q1', 'q2']);
  assert.equal(records.q1.correct, true);
  assert.equal(records.q2.correct, false);
  assert.deepEqual(records.q2.userAnswer, ['B']);
});

test('practice resume restores to first unanswered question instead of last viewed question', () => {
  const storage = memoryStorage();
  const key = buildPracticeResumeKey('user-1', ['practice', 'bank', 'bank-1']);
  const questions = [{ id: 'q1' }, { id: 'q2' }, { id: 'q3' }, { id: 'q4' }];

  const snapshot = savePracticeResume(key, questions, 3, {
    q1: {
      correct: true,
      userAnswer: ['A'],
      answer: ['A'],
      explanation: ''
    },
    q3: {
      correct: false,
      userAnswer: ['B'],
      answer: ['C'],
      explanation: ''
    }
  }, storage);

  assert.equal(resolvePracticeResumeIndex(key, questions, storage), 3);
  assert.equal(resolvePracticeResumeFirstUnansweredIndex(snapshot, questions), 1);
  assert.equal(resolvePracticeResumeRestoreIndex(snapshot, questions), 1);
});

test('practice resume restores last viewed question when no answer state exists', () => {
  const storage = memoryStorage();
  const key = buildPracticeResumeKey('user-1', ['practice', 'bank', 'bank-1']);
  const questions = [{ id: 'q1' }, { id: 'q2' }, { id: 'q3' }, { id: 'q4' }];

  const snapshot = savePracticeResume(key, questions, 2, undefined, storage);

  assert.equal(resolvePracticeResumeFirstUnansweredIndex(snapshot, questions), 0);
  assert.equal(resolvePracticeResumeRestoreIndex(snapshot, questions), 2);
});

test('practice resume detects completed snapshots and supports auto-answered questions', () => {
  const storage = memoryStorage();
  const key = buildPracticeResumeKey('user-1', ['practice', 'bank', 'bank-1']);
  const questions = [{ id: 'q1' }, { id: 'py1', type: 'python' }, { id: 'q2' }];

  const snapshot = savePracticeResume(key, questions, 2, {
    q1: {
      correct: true,
      userAnswer: ['A'],
      answer: ['A'],
      explanation: ''
    },
    q2: {
      correct: true,
      userAnswer: ['C'],
      answer: ['C'],
      explanation: ''
    }
  }, storage);

  assert.equal(
    isPracticeResumeSnapshotComplete(snapshot, questions, (question) => question.type === 'python'),
    true
  );
  assert.equal(resolvePracticeResumeFirstUnansweredIndex(snapshot, questions, (question) => question.type === 'python'), null);
});

test('practice resume asks before restoring meaningful saved progress', () => {
  const storage = memoryStorage();
  const key = buildPracticeResumeKey('user-1', ['practice', 'bank', 'bank-1']);
  const questions = [{ id: 'q1' }, { id: 'q2' }, { id: 'q3' }];

  assert.equal(shouldAskToRestorePracticeResume(null, questions, 1), false);
  const firstQuestionSnapshot = savePracticeResume(key, questions, 0, undefined, storage);
  assert.equal(shouldAskToRestorePracticeResume(firstQuestionSnapshot, questions, 0), false);

  const secondQuestionSnapshot = savePracticeResume(key, questions, 1, undefined, storage);
  assert.equal(shouldAskToRestorePracticeResume(secondQuestionSnapshot, questions, 1), true);

  const answeredFirstSnapshot = savePracticeResume(key, questions, 0, {
    q1: {
      correct: true,
      userAnswer: ['A'],
      answer: ['A'],
      explanation: ''
    }
  }, storage);
  assert.equal(shouldAskToRestorePracticeResume(answeredFirstSnapshot, questions, 0), true);
});

test('practice resume skips empty first-question snapshots', () => {
  assert.equal(shouldSavePracticeResumeSnapshot(0), false);
  assert.equal(shouldSavePracticeResumeSnapshot(1), true);
  assert.equal(shouldSavePracticeResumeSnapshot(0, {
    q1: {
      correct: true,
      userAnswer: ['A'],
      answer: ['A'],
      explanation: ''
    }
  }), true);
});
