import { api, getToken, postKeepalive } from '../api/request';
import {
  DEFAULT_PRESENCE_HEARTBEAT_INTERVAL_MS,
  DEFAULT_PRESENCE_HIDDEN_HEARTBEAT_INTERVAL_MS
} from '../config/presence';

const PRESENCE_SESSION_KEY = 'qanda_presence_session_id';

let heartbeatTimer: number | undefined;
let heartbeatInFlight = false;
let started = false;
let heartbeatIntervalMs = DEFAULT_PRESENCE_HEARTBEAT_INTERVAL_MS;

type HeartbeatResponse = {
  alive: boolean;
  sessionId: string;
  heartbeatIntervalMs?: number;
  heartbeatIntervalSeconds?: number;
  onlineWindowSeconds?: number;
  throttled?: boolean;
};

function createFallbackId() {
  return `tab-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function createSessionId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return createFallbackId();
}

function storageAvailable() {
  try {
    return typeof sessionStorage !== 'undefined' ? sessionStorage : null;
  } catch {
    return null;
  }
}

export function getPresenceSessionId() {
  const storage = storageAvailable();
  const existing = storage?.getItem(PRESENCE_SESSION_KEY);
  if (existing) return existing;

  const sessionId = createSessionId();
  storage?.setItem(PRESENCE_SESSION_KEY, sessionId);
  return sessionId;
}

export function presenceHeartbeatDelayMs(visibilityState: DocumentVisibilityState | string) {
  return visibilityState === 'visible'
    ? heartbeatIntervalMs
    : DEFAULT_PRESENCE_HIDDEN_HEARTBEAT_INTERVAL_MS;
}

function updateHeartbeatInterval(response: HeartbeatResponse | undefined) {
  const intervalMs = Number(response?.heartbeatIntervalMs || 0);
  const intervalSeconds = Number(response?.heartbeatIntervalSeconds || 0);
  const nextInterval = intervalMs > 0 ? intervalMs : intervalSeconds > 0 ? intervalSeconds * 1000 : 0;
  if (Number.isFinite(nextInterval) && nextInterval >= 30000) {
    heartbeatIntervalMs = Math.min(Math.floor(nextInterval), 600000);
  }
}

async function sendHeartbeat(reason: string) {
  if (!getToken() || heartbeatInFlight) return;

  heartbeatInFlight = true;
  try {
    const response = await api.post<HeartbeatResponse>('/presence/heartbeat', {
      sessionId: getPresenceSessionId(),
      reason
    });
    updateHeartbeatInterval(response);
  } catch {
    // 在线心跳不能影响正常答题流程；下一轮心跳会继续修复状态。
  } finally {
    heartbeatInFlight = false;
  }
}

function clearHeartbeatTimer() {
  if (heartbeatTimer === undefined) return;
  window.clearTimeout(heartbeatTimer);
  heartbeatTimer = undefined;
}

function scheduleNextHeartbeat() {
  if (!started || typeof document === 'undefined') return;
  clearHeartbeatTimer();
  heartbeatTimer = window.setTimeout(() => {
    heartbeatTimer = undefined;
    void sendHeartbeat(document.visibilityState === 'visible' ? 'interval' : 'hidden-interval')
      .finally(() => scheduleNextHeartbeat());
  }, presenceHeartbeatDelayMs(document.visibilityState));
}

function sendLeaveKeepalive() {
  if (!getToken()) return;
  postKeepalive('/presence/leave', { sessionId: getPresenceSessionId() });
}

function handleVisibilityChange() {
  if (document.visibilityState === 'visible') {
    void sendHeartbeat('visible').finally(() => scheduleNextHeartbeat());
    return;
  }
  scheduleNextHeartbeat();
}

function handlePageHide() {
  sendLeaveKeepalive();
}

function attachListeners() {
  document.addEventListener('visibilitychange', handleVisibilityChange);
  window.addEventListener('pagehide', handlePageHide);
}

function detachListeners() {
  document.removeEventListener('visibilitychange', handleVisibilityChange);
  window.removeEventListener('pagehide', handlePageHide);
}

export function startPresenceHeartbeat() {
  if (started || !getToken()) return;

  started = true;
  attachListeners();
  void sendHeartbeat('start').finally(() => scheduleNextHeartbeat());
}

export async function stopPresenceHeartbeat(options: { notify?: boolean } = {}) {
  const notify = options.notify ?? true;
  const wasStarted = started;
  started = false;

  clearHeartbeatTimer();
  detachListeners();

  if (notify && getToken() && wasStarted) {
    try {
      await api.post('/presence/leave', { sessionId: getPresenceSessionId() });
    } catch {
      sendLeaveKeepalive();
    }
  }
}
