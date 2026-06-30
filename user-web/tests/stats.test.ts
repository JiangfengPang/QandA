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
