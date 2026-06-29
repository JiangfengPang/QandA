import { api } from '../api/request';

export type PracticeReviewSummary = {
  wrongQuestionCount: number;
  favoriteCount: number;
  pendingAnswerCount?: number;
  queuedAnswerCount?: number;
  syncing?: boolean;
};

export type ReviewSummaryScope = {
  subjectId?: string;
  bankId?: string;
  scope?: string;
};

const REVIEW_SUMMARY_CACHE_MS = 10000;

const cache = new Map<string, { expiresAt: number; value: PracticeReviewSummary }>();
const pending = new Map<string, Promise<PracticeReviewSummary>>();

function scopePart(value: unknown) {
  return String(value || '').trim();
}

export function reviewSummaryCacheKey(userKey: string, scope: ReviewSummaryScope = {}) {
  return [
    scopePart(userKey) || 'anonymous',
    scopePart(scope.scope) || 'all',
    scopePart(scope.subjectId) || 'all-subjects',
    scopePart(scope.bankId) || 'all-banks'
  ].join(':');
}

function reviewSummaryUrl(scope: ReviewSummaryScope = {}) {
  const params = new URLSearchParams();
  if (scope.subjectId) params.set('subjectId', scope.subjectId);
  if (scope.bankId) params.set('bankId', scope.bankId);
  if (scope.scope) params.set('scope', scope.scope);
  const query = params.toString();
  return `/practice/review-summary${query ? `?${query}` : ''}`;
}

export function clearReviewSummaryCache(userKey?: string) {
  if (!userKey) {
    cache.clear();
    pending.clear();
    return;
  }
  const prefix = `${scopePart(userKey)}:`;
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
  for (const key of pending.keys()) {
    if (key.startsWith(prefix)) pending.delete(key);
  }
}

export async function fetchPracticeReviewSummary(
  userKey: string,
  scope: ReviewSummaryScope = {},
  options: { now?: number; ttlMs?: number; fetcher?: (url: string) => Promise<PracticeReviewSummary> } = {}
) {
  const key = reviewSummaryCacheKey(userKey, scope);
  const now = options.now ?? Date.now();
  const ttlMs = options.ttlMs ?? REVIEW_SUMMARY_CACHE_MS;
  const cached = cache.get(key);
  if (cached && cached.expiresAt > now) return cached.value;

  const pendingRequest = pending.get(key);
  if (pendingRequest) return pendingRequest;

  const fetcher = options.fetcher || ((url: string) => api.get<PracticeReviewSummary>(url));
  const request = fetcher(reviewSummaryUrl(scope))
    .then((value) => {
      const normalized = {
        wrongQuestionCount: Number(value?.wrongQuestionCount || 0),
        favoriteCount: Number(value?.favoriteCount || 0),
        pendingAnswerCount: Number(value?.pendingAnswerCount || value?.queuedAnswerCount || 0),
        queuedAnswerCount: Number(value?.queuedAnswerCount || value?.pendingAnswerCount || 0),
        syncing: Boolean(value?.syncing)
      };
      cache.set(key, { expiresAt: Date.now() + ttlMs, value: normalized });
      return normalized;
    })
    .finally(() => {
      pending.delete(key);
    });

  pending.set(key, request);
  return request;
}
