import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canGoToPreviousQuestion,
  getQuestionDisplayGroups,
  getQuestionDisplayProgress,
  getReadingSubQuestionProgress,
  getUnitQueueProgress,
  questionDisplayKey,
  practiceProgressNumber,
  practiceProgressPercent
} from '../src/utils/practiceProgress';

const questions = [
  ...Array.from({ length: 34 }, (_, index) => ({
    bankId: 'unit-1',
    type: index < 16 ? 'judge' : 'single'
  })),
  ...Array.from({ length: 27 }, (_, index) => ({
    bankId: 'unit-2',
    type: index < 8 ? 'judge' : 'single'
  }))
];

test('global progress follows the loaded practice queue instead of overview sorting', () => {
  assert.equal(practiceProgressNumber(0, 61), 1);
  assert.equal(practiceProgressNumber(18, 61), 19);
  assert.equal(practiceProgressNumber(33, 61), 34);
  assert.equal(practiceProgressNumber(34, 61), 35);
  assert.equal(practiceProgressNumber(60, 61), 61);
});

test('previous question availability uses the same queue index', () => {
  assert.equal(canGoToPreviousQuestion(0), false);
  assert.equal(canGoToPreviousQuestion(1), true);
  assert.equal(canGoToPreviousQuestion(18), true);
  assert.equal(canGoToPreviousQuestion(34), true);
});

test('unit progress crosses the 34-question boundary without resetting global progress', () => {
  assert.deepEqual(getUnitQueueProgress(questions, 0), { current: 1, total: 34 });
  assert.deepEqual(getUnitQueueProgress(questions, 18), { current: 19, total: 34 });
  assert.deepEqual(getUnitQueueProgress(questions, 33), { current: 34, total: 34 });
  assert.deepEqual(getUnitQueueProgress(questions, 34), { current: 1, total: 27 });
});

test('progress percentage is based on all loaded questions', () => {
  assert.equal(practiceProgressPercent(0, 61), 2);
  assert.equal(practiceProgressPercent(33, 61), 56);
  assert.equal(practiceProgressPercent(34, 61), 57);
  assert.equal(practiceProgressPercent(60, 61), 100);
  assert.equal(practiceProgressPercent(0, 0), 0);
});

test('reading display groups use the shared passage when passageId is missing', () => {
  const readingQuestions = [
    {
      id: 'q1',
      bankId: 'reading-bank',
      type: 'reading',
      question: 'Passage One. Read the passage and choose the best answer.',
      readingPassage: 'Shared passage body',
      readingQuestion: 'Question 1'
    },
    {
      id: 'q2',
      bankId: 'reading-bank',
      type: 'reading',
      question: 'Passage One. Read the passage and choose the best answer.',
      readingPassage: 'Shared passage body',
      readingQuestion: 'Question 2'
    },
    {
      id: 'q3',
      bankId: 'reading-bank',
      type: 'reading',
      question: 'Passage Two. Read the passage and choose the best answer.',
      readingPassage: 'Another passage body',
      readingQuestion: 'Question 1'
    }
  ];

  assert.equal(questionDisplayKey(readingQuestions[0], 0), questionDisplayKey(readingQuestions[1], 1));
  assert.notEqual(questionDisplayKey(readingQuestions[0], 0), questionDisplayKey(readingQuestions[2], 2));

  const groups = getQuestionDisplayGroups(readingQuestions);
  assert.equal(groups.length, 2);
  assert.deepEqual(groups[0].indices, [0, 1]);
  assert.deepEqual(groups[1].indices, [2]);
  assert.deepEqual(getQuestionDisplayProgress(readingQuestions, 1), {
    current: 1,
    total: 2,
    group: groups[0]
  });
  assert.deepEqual(getReadingSubQuestionProgress(readingQuestions, 1), { current: 2, total: 2 });
});

test('reading display groups can distinguish same stems with different passage bodies', () => {
  const readingQuestions = [
    {
      id: 'a1',
      bankId: 'reading-bank',
      type: 'reading',
      question: 'Read the passage and choose the best answer.',
      readingPassage: 'Passage A',
      readingQuestion: 'Question 1'
    },
    {
      id: 'b1',
      bankId: 'reading-bank',
      type: 'reading',
      question: 'Read the passage and choose the best answer.',
      readingPassage: 'Passage B',
      readingQuestion: 'Question 1'
    }
  ];

  const groups = getQuestionDisplayGroups(readingQuestions);
  assert.equal(groups.length, 2);
  assert.deepEqual(groups.map((group) => group.number), [1, 2]);
});
