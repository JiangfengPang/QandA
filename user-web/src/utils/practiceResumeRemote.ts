import { api, request } from '../api/request';
import type { PracticeResumeSnapshot } from './practiceResume';

type RemotePracticeResumeResponse = {
  snapshot: PracticeResumeSnapshot | null;
  updatedAt?: string | null;
};

type RemotePracticeResumeSaveTarget = {
  key: string;
  snapshot: PracticeResumeSnapshot | null;
};

type ResolvedRemotePracticeResumeSaveTarget = {
  key: string;
  snapshot: PracticeResumeSnapshot;
};

type TimerHandle = ReturnType<typeof setTimeout>;

export type RemotePracticeResumeSaveControllerOptions = {
  read: () => RemotePracticeResumeSaveTarget | null;
  onSaved?: (sent: RemotePracticeResumeSaveTarget, savedSnapshot: PracticeResumeSnapshot | null) => void;
  save?: typeof saveRemotePracticeResume;
  debounceMs?: number;
  retryBaseMs?: number;
  retryMaxMs?: number;
  setTimeoutFn?: typeof setTimeout;
  clearTimeoutFn?: typeof clearTimeout;
};

export const REMOTE_PRACTICE_RESUME_SAVE_DEBOUNCE_MS = 30000;
const REMOTE_PRACTICE_RESUME_RETRY_BASE_MS = 5000;
const REMOTE_PRACTICE_RESUME_RETRY_MAX_MS = 60000;

function sessionUrl(key: string) {
  return `/practice/sessions?key=${encodeURIComponent(key)}`;
}

function normalizeRemoteSnapshot(response: RemotePracticeResumeResponse) {
  if (!response.snapshot) return null;
  return {
    ...response.snapshot,
    updatedAt: response.updatedAt || response.snapshot.updatedAt || ''
  };
}

export async function fetchRemotePracticeResume(key: string) {
  if (!key) return null;
  const response = await api.get<RemotePracticeResumeResponse>(sessionUrl(key));
  return normalizeRemoteSnapshot(response);
}

export async function saveRemotePracticeResume(key: string, snapshot: PracticeResumeSnapshot, options: RequestInit = {}) {
  if (!key) return null;
  const response = await request<RemotePracticeResumeResponse>('/practice/sessions', {
    ...options,
    method: 'PUT',
    body: JSON.stringify({ key, snapshot })
  });
  return normalizeRemoteSnapshot(response);
}

export async function clearRemotePracticeResume(key: string) {
  if (!key) return;
  await api.delete(sessionUrl(key));
}

function snapshotFingerprint(key: string, snapshot: PracticeResumeSnapshot | null) {
  if (!key || !snapshot) return '';
  const { updatedAt: _updatedAt, ...stableSnapshot } = snapshot;
  return `${key}:${JSON.stringify(stableSnapshot)}`;
}

export function createRemotePracticeResumeSaveController(options: RemotePracticeResumeSaveControllerOptions) {
  const save = options.save || saveRemotePracticeResume;
  const debounceMs = options.debounceMs ?? REMOTE_PRACTICE_RESUME_SAVE_DEBOUNCE_MS;
  const retryBaseMs = options.retryBaseMs ?? REMOTE_PRACTICE_RESUME_RETRY_BASE_MS;
  const retryMaxMs = options.retryMaxMs ?? REMOTE_PRACTICE_RESUME_RETRY_MAX_MS;
  const setTimer = options.setTimeoutFn || setTimeout;
  const clearTimer = options.clearTimeoutFn || clearTimeout;

  let timer: TimerHandle | null = null;
  let inFlight = false;
  let dirtyWhileInFlight = false;
  let lastSavedFingerprint = '';
  let retryDelayMs = retryBaseMs;

  function currentTarget(): ResolvedRemotePracticeResumeSaveTarget | null {
    const target = options.read();
    if (!target?.key || !target.snapshot) return null;
    return { key: target.key, snapshot: target.snapshot };
  }

  function clearScheduledSave() {
    if (!timer) return;
    clearTimer(timer);
    timer = null;
  }

  function schedule(delayMs = debounceMs) {
    clearScheduledSave();
    timer = setTimer(() => {
      timer = null;
      void run();
    }, Math.max(0, delayMs));
  }

  async function run(requestOptions: RequestInit = {}) {
    clearScheduledSave();
    const target = currentTarget();
    if (!target) return null;

    const fingerprint = snapshotFingerprint(target.key, target.snapshot);
    if (fingerprint && fingerprint === lastSavedFingerprint) return null;

    if (inFlight) {
      dirtyWhileInFlight = true;
      return null;
    }

    inFlight = true;
    dirtyWhileInFlight = false;
    let retryAfterFailure = false;

    try {
      const savedSnapshot = await save(target.key, target.snapshot, requestOptions);
      lastSavedFingerprint = fingerprint;
      retryDelayMs = retryBaseMs;
      options.onSaved?.(target, savedSnapshot);
      return savedSnapshot;
    } catch {
      retryAfterFailure = true;
      return null;
    } finally {
      inFlight = false;
      if (dirtyWhileInFlight) {
        schedule(0);
      } else if (retryAfterFailure) {
        schedule(retryDelayMs);
        retryDelayMs = Math.min(retryDelayMs * 2, retryMaxMs);
      }
    }
  }

  return {
    schedule: (delayMs = debounceMs) => schedule(delayMs),
    flush: (requestOptions: RequestInit = {}) => run(requestOptions),
    cancel: clearScheduledSave,
    isInFlight: () => inFlight,
    markDirty: () => {
      dirtyWhileInFlight = true;
    },
    getLastSavedFingerprint: () => lastSavedFingerprint
  };
}
