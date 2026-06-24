export type PendingAnswerStatus = 'pending' | 'syncing' | 'failed' | 'auth_failed' | 'invalid';

export type PendingAnswerRecord = {
  clientAnswerId: string;
  questionId: string;
  selectedAnswer: string[];
  isCorrect: boolean;
  answeredAt: string;
  retryCount: number;
  lastTriedAt: string;
  status: PendingAnswerStatus;
  durationSeconds?: number;
  lastError?: string;
  lastStatusCode?: number;
};

export type PendingAnswerSummary = {
  total: number;
  retryable: number;
  syncing: number;
  authFailed: number;
  invalid: number;
};

export type QueueStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const STORAGE_PREFIX = 'qanda:pending-answers';
const QUICK_RETRY_DELAY_MS = 1000;
const RETRY_DELAYS_MS = [0, QUICK_RETRY_DELAY_MS, QUICK_RETRY_DELAY_MS, 5000, 15000, 60000];
const STALE_SYNCING_MS = 30000;
const memoryQueues = new Map<string, string>();

function storageAvailable() {
  return typeof localStorage !== 'undefined' ? localStorage : null;
}

export function pendingAnswerQueueKey(userKey: string) {
  return `${STORAGE_PREFIX}:${encodeURIComponent(String(userKey || '').trim())}`;
}

function normalizeStatus(value: unknown): PendingAnswerStatus {
  if (value === 'syncing' || value === 'failed' || value === 'auth_failed' || value === 'invalid') return value;
  return 'pending';
}

function normalizeRecord(value: unknown): PendingAnswerRecord | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<PendingAnswerRecord>;
  const clientAnswerId = String(raw.clientAnswerId || '').trim();
  const questionId = String(raw.questionId || '').trim();
  if (!clientAnswerId || !questionId) return null;

  return {
    clientAnswerId,
    questionId,
    selectedAnswer: Array.isArray(raw.selectedAnswer) ? raw.selectedAnswer.map((item) => String(item)) : [],
    isCorrect: Boolean(raw.isCorrect),
    answeredAt: String(raw.answeredAt || new Date().toISOString()),
    retryCount: Math.max(0, Math.floor(Number(raw.retryCount) || 0)),
    lastTriedAt: String(raw.lastTriedAt || ''),
    status: normalizeStatus(raw.status),
    durationSeconds: raw.durationSeconds === undefined ? undefined : Math.max(0, Math.floor(Number(raw.durationSeconds) || 0)),
    lastError: raw.lastError ? String(raw.lastError) : undefined,
    lastStatusCode: raw.lastStatusCode === undefined ? undefined : Number(raw.lastStatusCode)
  };
}

export function readPendingAnswerQueue(userKey: string, storage: QueueStorage | null = storageAvailable()): PendingAnswerRecord[] {
  if (!userKey) return [];
  const key = pendingAnswerQueueKey(userKey);
  let raw = '';
  if (!storage) {
    raw = memoryQueues.get(key) || '';
  }
  try {
    raw = storage ? storage.getItem(key) || '' : raw;
  } catch {
    raw = memoryQueues.get(key) || '';
  }
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeRecord).filter((record): record is PendingAnswerRecord => Boolean(record));
  } catch {
    return [];
  }
}

export function writePendingAnswerQueue(userKey: string, records: PendingAnswerRecord[], storage: QueueStorage | null = storageAvailable()) {
  if (!userKey) return;
  const key = pendingAnswerQueueKey(userKey);
  const normalized = records.map(normalizeRecord).filter((record): record is PendingAnswerRecord => Boolean(record));
  const serialized = JSON.stringify(normalized);
  if (!normalized.length) memoryQueues.delete(key);
  else memoryQueues.set(key, serialized);
  if (!storage) return;
  try {
    if (!normalized.length) {
      storage.removeItem(key);
      return;
    }
    storage.setItem(key, serialized);
  } catch {
    // localStorage can be unavailable or full in private modes; answering must keep working.
  }
}

export function enqueuePendingAnswer(userKey: string, record: PendingAnswerRecord, storage: QueueStorage | null = storageAvailable()): PendingAnswerRecord | null {
  const records = readPendingAnswerQueue(userKey, storage);
  const existingIndex = records.findIndex((item) => item.clientAnswerId === record.clientAnswerId);
  if (existingIndex >= 0) {
    return records[existingIndex];
  }

  const normalized = normalizeRecord(record);
  if (!normalized) return null;
  records.push(normalized);
  writePendingAnswerQueue(userKey, records, storage);
  return normalized;
}

export function removePendingAnswer(userKey: string, clientAnswerId: string, storage: QueueStorage | null = storageAvailable()) {
  const records = readPendingAnswerQueue(userKey, storage);
  const next = records.filter((record) => record.clientAnswerId !== clientAnswerId);
  writePendingAnswerQueue(userKey, next, storage);
}

export function updatePendingAnswer(
  userKey: string,
  clientAnswerId: string,
  updater: Partial<PendingAnswerRecord> | ((record: PendingAnswerRecord) => PendingAnswerRecord),
  storage: QueueStorage | null = storageAvailable()
): PendingAnswerRecord | null {
  const records = readPendingAnswerQueue(userKey, storage);
  let updated: PendingAnswerRecord | null = null;
  const next = records.map((record) => {
    if (record.clientAnswerId !== clientAnswerId) return record;
    const value = typeof updater === 'function' ? updater(record) : { ...record, ...updater };
    updated = normalizeRecord(value);
    return updated || record;
  });
  writePendingAnswerQueue(userKey, next, storage);
  return updated;
}

export function retryDelayMs(record: PendingAnswerRecord) {
  if (record.status === 'auth_failed' || record.status === 'invalid') return Number.POSITIVE_INFINITY;
  const retryCount = Math.max(0, Math.floor(Number(record.retryCount) || 0));
  if (retryCount >= RETRY_DELAYS_MS.length) return RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1];
  return RETRY_DELAYS_MS[retryCount];
}

export function isPendingAnswerDue(record: PendingAnswerRecord, now = Date.now()) {
  if (record.status === 'auth_failed' || record.status === 'invalid') return false;
  const lastTriedAt = Date.parse(record.lastTriedAt || '');
  const baseTime = Number.isFinite(lastTriedAt) ? lastTriedAt : 0;
  if (record.status === 'syncing' && now - baseTime < STALE_SYNCING_MS) return false;
  return now - baseTime >= retryDelayMs(record);
}

export function selectDuePendingAnswers(userKey: string, now = Date.now(), storage: QueueStorage | null = storageAvailable()) {
  return readPendingAnswerQueue(userKey, storage).filter((record) => isPendingAnswerDue(record, now));
}

export function nextPendingRetryDelayMs(userKey: string, now = Date.now(), storage: QueueStorage | null = storageAvailable()) {
  const retryable = readPendingAnswerQueue(userKey, storage).filter((record) => (
    record.status !== 'auth_failed' && record.status !== 'invalid'
  ));
  if (!retryable.length) return null;

  return Math.max(0, Math.min(...retryable.map((record) => {
    const lastTriedAt = Date.parse(record.lastTriedAt || '');
    const baseTime = Number.isFinite(lastTriedAt) ? lastTriedAt : 0;
    const delay = record.status === 'syncing' ? STALE_SYNCING_MS : retryDelayMs(record);
    return baseTime + delay - now;
  })));
}

export function resetAuthFailedPendingAnswers(userKey: string, storage: QueueStorage | null = storageAvailable()) {
  const records = readPendingAnswerQueue(userKey, storage);
  let changed = false;
  const next = records.map((record) => {
    if (record.status !== 'auth_failed') return record;
    changed = true;
    return { ...record, status: 'pending' as PendingAnswerStatus, lastTriedAt: '', lastError: undefined, lastStatusCode: undefined };
  });
  if (changed) writePendingAnswerQueue(userKey, next, storage);
}

export function summarizePendingAnswerQueue(userKey: string, storage: QueueStorage | null = storageAvailable()): PendingAnswerSummary {
  const records = readPendingAnswerQueue(userKey, storage);
  return {
    total: records.filter((record) => record.status !== 'invalid').length,
    retryable: records.filter((record) => record.status !== 'auth_failed' && record.status !== 'invalid').length,
    syncing: records.filter((record) => record.status === 'syncing').length,
    authFailed: records.filter((record) => record.status === 'auth_failed').length,
    invalid: records.filter((record) => record.status === 'invalid').length
  };
}
