import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('practice favorite submits the desired state and rolls back on failure', () => {
  const source = readFileSync(new URL('../src/views/PracticeView.vue', import.meta.url), 'utf8');

  assert.match(source, /favoriteSubmittingByQuestionId/);
  assert.match(source, /:disabled="currentFavoriteSubmitting"/);
  assert.match(source, /const previousFavorite = Boolean\(question\.favorite\)/);
  assert.match(source, /const nextFavorite = !previousFavorite/);
  assert.match(source, /question\.favorite = nextFavorite/);
  assert.match(source, /favorite: nextFavorite/);
  assert.match(source, /question\.favorite = previousFavorite/);
  assert.match(source, /finally \{\s*setFavoriteSubmitting\(questionId, false\);/);
});
