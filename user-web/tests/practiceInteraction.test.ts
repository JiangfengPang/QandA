import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canAutoAdvanceAfterCorrectAnswer,
  needsManualAnswerConfirm,
  shouldSubmitChoiceImmediately
} from '../src/utils/practiceInteraction';

test('reading choices only update local state before explicit submit', () => {
  assert.equal(needsManualAnswerConfirm('reading', false), false);
  assert.equal(shouldSubmitChoiceImmediately('reading'), false);
});

test('all objective choices wait for explicit session submission after selection', () => {
  assert.equal(needsManualAnswerConfirm('multiple', false), true);
  assert.equal(shouldSubmitChoiceImmediately('multiple'), false);
  assert.equal(shouldSubmitChoiceImmediately('single'), false);
  assert.equal(shouldSubmitChoiceImmediately('judge'), false);
});

test('correct-answer auto advance follows the preference and queue boundary', () => {
  assert.equal(canAutoAdvanceAfterCorrectAnswer({
    autoAdvanceOnCorrect: true,
    currentIndex: 0,
    questionCount: 5
  }), true);

  assert.equal(canAutoAdvanceAfterCorrectAnswer({
    autoAdvanceOnCorrect: false,
    currentIndex: 0,
    questionCount: 5
  }), false);

  assert.equal(canAutoAdvanceAfterCorrectAnswer({
    autoAdvanceOnCorrect: true,
    currentIndex: 4,
    questionCount: 5
  }), false);
});
