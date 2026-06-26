import assert from 'node:assert/strict';
import test from 'node:test';
import { isAnswerCorrect, isFillAnswerCorrect, normalizeAnswer, normalizeFillAnswerGroups } from '../src/utils/answer';

test('local answer comparison matches server normalization', () => {
  assert.deepEqual(normalizeAnswer(['b', ' A ', 'a']), ['A', 'B']);
  assert.equal(isAnswerCorrect(['b', 'a'], ['A', 'B']), true);
  assert.equal(isAnswerCorrect(['A'], ['A', 'B']), false);
  assert.equal(isAnswerCorrect(['  true  '], ['true']), true);
  assert.equal(isAnswerCorrect([' Adequately '], ['adequately']), true);
  assert.equal(isAnswerCorrect(['look upon ... as'], ['look upon … as']), true);
});

test('local fill answer comparison accepts any configured answer variant', () => {
  assert.equal(isFillAnswerCorrect([' Colour '], ['color', 'colour']), true);
  assert.equal(isFillAnswerCorrect(['color'], ['color', 'colour']), true);
  assert.equal(isFillAnswerCorrect(['colours'], ['color', 'colour']), false);
  assert.equal(isAnswerCorrect(['color'], ['color', 'colour']), false);
});

test('local multi blank fill comparison preserves blank order and per-blank variants', () => {
  const answer = [['aspiration'], ['aspirational', 'ambitious']];
  assert.deepEqual(normalizeFillAnswerGroups(answer), [['aspiration'], ['ambitious', 'aspirational']]);
  assert.equal(isFillAnswerCorrect([' aspiration ', 'Ambitious'], answer), true);
  assert.equal(isFillAnswerCorrect(['ambitious', 'aspiration'], answer), false);
  assert.equal(isFillAnswerCorrect(['aspiration'], answer), false);
  assert.equal(isFillAnswerCorrect(['aspiration', 'aspirational', 'extra'], answer), false);
});
