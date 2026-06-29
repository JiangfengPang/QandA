import assert from 'node:assert/strict';
import test from 'node:test';
import {
  clearReviewSummaryCache,
  fetchPracticeReviewSummary,
  reviewSummaryCacheKey
} from '../src/utils/reviewSummary';

test('review summary cache key is scoped by user and filters', () => {
  assert.notEqual(
    reviewSummaryCacheKey('user-a', { subjectId: 'subject-1' }),
    reviewSummaryCacheKey('user-b', { subjectId: 'subject-1' })
  );
  assert.notEqual(
    reviewSummaryCacheKey('user-a', { subjectId: 'subject-1' }),
    reviewSummaryCacheKey('user-a', { subjectId: 'subject-2' })
  );
});

test('review summary reuses pending promise for duplicate requests', async () => {
  clearReviewSummaryCache();
  let fetchCount = 0;
  const fetcher = async () => {
    fetchCount += 1;
    await new Promise((resolve) => setTimeout(resolve, 1));
    return { wrongQuestionCount: 2, favoriteCount: 1 };
  };

  const [left, right] = await Promise.all([
    fetchPracticeReviewSummary('user-a', {}, { fetcher }),
    fetchPracticeReviewSummary('user-a', {}, { fetcher })
  ]);

  assert.equal(fetchCount, 1);
  assert.deepEqual(left, right);
});

test('review summary uses short cache for repeated reads', async () => {
  clearReviewSummaryCache();
  let fetchCount = 0;
  const fetcher = async () => {
    fetchCount += 1;
    return { wrongQuestionCount: fetchCount, favoriteCount: 0 };
  };

  const first = await fetchPracticeReviewSummary('user-a', {}, { fetcher, ttlMs: 10000 });
  const second = await fetchPracticeReviewSummary('user-a', {}, { fetcher, ttlMs: 10000 });

  assert.equal(fetchCount, 1);
  assert.equal(first.wrongQuestionCount, 1);
  assert.equal(second.wrongQuestionCount, 1);
});
