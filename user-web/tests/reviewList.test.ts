import assert from 'node:assert/strict';
import test from 'node:test';
import {
  initialReviewRenderCount,
  nextReviewRenderCount,
  REVIEW_INITIAL_RENDER_COUNT,
  REVIEW_RENDER_BATCH_SIZE
} from '../src/utils/reviewList';

test('review list renders an initial bounded batch', () => {
  assert.equal(initialReviewRenderCount(0), 0);
  assert.equal(initialReviewRenderCount(3), 3);
  assert.equal(initialReviewRenderCount(200), REVIEW_INITIAL_RENDER_COUNT);
});

test('review list grows by batch without exceeding total', () => {
  assert.equal(nextReviewRenderCount(200, REVIEW_INITIAL_RENDER_COUNT), REVIEW_INITIAL_RENDER_COUNT + REVIEW_RENDER_BATCH_SIZE);
  assert.equal(nextReviewRenderCount(20, 16), 20);
  assert.equal(nextReviewRenderCount(10, 30), 10);
});

test('review list normalizes invalid counts', () => {
  assert.equal(initialReviewRenderCount(-4), 0);
  assert.equal(nextReviewRenderCount(-4, 10), 0);
  assert.equal(nextReviewRenderCount(20, -2, 0), 1);
});
