import assert from 'node:assert/strict';
import test from 'node:test';
import {
  answeredCountForDisplay,
  completionRateForDisplay,
  defaultStatsPayload
} from '../src/types/stats';
import { readFileSync } from 'node:fs';

test('stats display counts queued answers without exceeding total questions', () => {
  const stats = {
    ...defaultStatsPayload(),
    totalQuestionCount: 10,
    answerCount: 4,
    pendingAnswerCount: 3
  };

  assert.equal(answeredCountForDisplay(stats), 7);
  assert.equal(completionRateForDisplay(stats), 70);
  assert.equal(answeredCountForDisplay({ ...stats, pendingAnswerCount: 20 }), 10);
});

test('stats view refreshes when answer data changes outside initial mount', () => {
  const source = readFileSync(new URL('../src/views/StatsView.vue', import.meta.url), 'utf8');

  assert.match(source, /qanda:stats-updated/);
  assert.match(source, /visibilitychange/);
  assert.match(source, /window\.addEventListener\('focus'/);
  assert.match(source, /window\.removeEventListener\('focus'/);
  assert.match(source, /scheduleRefreshAndRender/);
});

test('stats page silently flushes local pending answers without showing sync copy', () => {
  const composable = readFileSync(new URL('../src/composables/usePracticeStats.ts', import.meta.url), 'utf8');

  assert.match(composable, /requestPendingAnswerSessionFlush/);
  assert.match(composable, /clearPendingAnswerQueue/);
  assert.match(composable, /requestLocalPendingAnswerFlush/);
  assert.match(composable, /await requestLocalPendingAnswerFlush\(\)/);
  assert.doesNotMatch(composable, /同步中/);
  assert.doesNotMatch(composable, /待确认/);
  assert.doesNotMatch(composable, /答案正在同步/);
});

test('app startup silently flushes local pending answer sessions outside stats page', () => {
  const app = readFileSync(new URL('../src/App.vue', import.meta.url), 'utf8');
  const sync = readFileSync(new URL('../src/utils/pendingAnswerSync.ts', import.meta.url), 'utf8');

  assert.match(app, /requestPendingAnswerSessionFlush/);
  assert.match(app, /requestAppPendingAnswerFlush/);
  assert.match(app, /Boolean\(auth\.user\) && !isAuthLayout\.value/);
  assert.match(app, /window\.addEventListener\('online', handlePendingAnswerOnline\)/);
  assert.match(sync, /requestPendingAnswerSessionFlush/);
  assert.match(sync, /pendingAnswerFlushByUserKey/);
});
