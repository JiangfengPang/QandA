import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applySavedPracticeQuestionOrder,
  newerPracticeResume,
  buildPracticeResumeKey,
  clearPracticeResume,
  practiceResumeUpdatedAt,
  readPracticeResumeSessionRecords,
  readPracticeResume,
  resolvePracticeResumeIndex,
  savePracticeResume
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
