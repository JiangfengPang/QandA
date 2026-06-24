import assert from 'node:assert/strict';
import test from 'node:test';
import { isAnswerCorrect, normalizeAnswer } from '../src/utils/answer';

test('local answer comparison matches server normalization', () => {
  assert.deepEqual(normalizeAnswer(['b', ' A ', 'a']), ['A', 'B']);
  assert.equal(isAnswerCorrect(['b', 'a'], ['A', 'B']), true);
  assert.equal(isAnswerCorrect(['A'], ['A', 'B']), false);
  assert.equal(isAnswerCorrect(['  true  '], ['true']), true);
});
