import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canGoToPreviousQuestion,
  getUnitQueueProgress,
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
