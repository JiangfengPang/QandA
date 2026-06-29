import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { presenceHeartbeatDelayMs } from '../src/utils/presence';
import {
  DEFAULT_PRESENCE_HEARTBEAT_INTERVAL_MS,
  DEFAULT_PRESENCE_HIDDEN_HEARTBEAT_INTERVAL_MS
} from '../src/config/presence';

test('presence heartbeat uses longer interval while page is hidden', () => {
  assert.equal(presenceHeartbeatDelayMs('visible'), DEFAULT_PRESENCE_HEARTBEAT_INTERVAL_MS);
  assert.equal(presenceHeartbeatDelayMs('hidden'), DEFAULT_PRESENCE_HIDDEN_HEARTBEAT_INTERVAL_MS);
  assert.ok(DEFAULT_PRESENCE_HIDDEN_HEARTBEAT_INTERVAL_MS > DEFAULT_PRESENCE_HEARTBEAT_INTERVAL_MS);
});

test('presence heartbeat sends immediately when page becomes visible again', () => {
  const source = readFileSync(new URL('../src/utils/presence.ts', import.meta.url), 'utf8');
  assert.match(source, /document\.visibilityState === 'visible'/);
  assert.match(source, /sendHeartbeat\('visible'\)/);
  assert.match(source, /postKeepalive\('\/presence\/leave'/);
});
