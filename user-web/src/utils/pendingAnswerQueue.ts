export type PendingAnswerStatus = 'pending' | 'syncing' | 'failed' | 'auth_failed' | 'invalid';

export type PendingAnswerRecord = {
  clientAnswerId: string;
  questionId: string;
  practiceSessionId?: string;
  sessionKey?: string;
  clientSubmissionId?: string;
  questionIndex?: number;
  scope?: string;
  selectedAnswer: string[];
  isCorrect: boolean;
  answer?: string[];
  explanation?: string;
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
const SAME_SESSION_QUESTION_COLLAPSE_MS = 10000;
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
    practiceSessionId: raw.practiceSessionId ? String(raw.practiceSessionId).trim().slice(0, 191) : undefined,
    sessionKey: raw.sessionKey ? String(raw.sessionKey).trim().slice(0, 191) : undefined,
    clientSubmissionId: raw.clientSubmissionId ? String(raw.clientSubmissionId).trim().slice(0, 120) : undefined,
    questionIndex: raw.questionIndex === undefined ? undefined : Math.max(0, Math.floor(Number(raw.questionIndex) || 0)),
    scope: raw.scope ? String(raw.scope).trim().slice(0, 120) : undefined,
    selectedAnswer: Array.isArray(raw.selectedAnswer) ? raw.selectedAnswer.map((item) => String(item)) : [],
    isCorrect: Boolean(raw.isCorrect),
    answer: Array.isArray(raw.answer) ? raw.answer.map((item) => String(item)) : undefined,
    explanation: raw.explanation === undefined ? undefined : String(raw.explanation),
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
  const normalized = normalizeRecord(record);
  if (!normalized) return null;

  const answeredAtMs = Date.parse(normalized.answeredAt || '');
  const samePracticeQuestionKey = normalized.practiceSessionId
    ? `${normalized.practiceSessionId}:${normalized.questionId}`
    : '';
  const sameSessionQuestionKey = normalized.sessionKey
    ? `${normalized.sessionKey}:${normalized.questionId}`
    : '';
  const next = records.filter((item) => {
    if (item.clientAnswerId === normalized.clientAnswerId) return false;
    if (samePracticeQuestionKey && `${item.practiceSessionId || ''}:${item.questionId}` === samePracticeQuestionKey) return false;
    if (!sameSessionQuestionKey || `${item.sessionKey || ''}:${item.questionId}` !== sameSessionQuestionKey) return true;
    const itemAnsweredAtMs = Date.parse(item.answeredAt || '');
    if (!Number.isFinite(answeredAtMs) || !Number.isFinite(itemAnsweredAtMs)) return true;
    return Math.abs(answeredAtMs - itemAnsweredAtMs) > SAME_SESSION_QUESTION_COLLAPSE_MS;
  });
  next.push(normalized);
  writePendingAnswerQueue(userKey, next, storage);
  return normalized;
}

export function dedupePendingAnswerRecords(records: PendingAnswerRecord[]) {
  const byClientAnswerId = new Map<string, PendingAnswerRecord>();
  for (const record of records) {
    const normalized = normalizeRecord(record);
    if (!normalized) continue;
    byClientAnswerId.set(normalized.clientAnswerId, normalized);
  }

  const bySessionQuestion = new Map<string, PendingAnswerRecord>();
  const deduped: PendingAnswerRecord[] = [];
  for (const record of byClientAnswerId.values()) {
    const key = record.practiceSessionId
      ? `${record.practiceSessionId}:${record.questionId}`
      : record.sessionKey ? `${record.sessionKey}:${record.questionId}` : '';
    if (!key) {
      deduped.push(record);
      continue;
    }

    const existing = bySessionQuestion.get(key);
    if (!existing) {
      bySessionQuestion.set(key, record);
      continue;
    }

    const existingTime = Date.parse(existing.answeredAt || '');
    const recordTime = Date.parse(record.answeredAt || '');
    const shouldReplace = !Number.isFinite(existingTime)
      || (Number.isFinite(recordTime) && recordTime >= existingTime);
    if (shouldReplace) bySessionQuestion.set(key, record);
  }

  deduped.push(...bySessionQuestion.values());
  return deduped.sort((left, right) => {
    const leftTime = Date.parse(left.answeredAt || '');
    const rightTime = Date.parse(right.answeredAt || '');
    const safeLeftTime = Number.isFinite(leftTime) ? leftTime : 0;
    const safeRightTime = Number.isFinite(rightTime) ? rightTime : 0;
    return safeLeftTime - safeRightTime;
  });
}

export function removePendingAnswer(userKey: string, clientAnswerId: string, storage: QueueStorage | null = storageAvailable()) {
  const records = readPendingAnswerQueue(userKey, storage);
  const next = records.filter((record) => record.clientAnswerId !== clientAnswerId);
  writePendingAnswerQueue(userKey, next, storage);
}

export function removePendingAnswersByClientAnswerIds(
  userKey: string,
  clientAnswerIds: Iterable<string>,
  storage: QueueStorage | null = storageAvailable()
) {
  const ids = new Set([...clientAnswerIds].map((item) => String(item || '').trim()).filter(Boolean));
  if (!ids.size) return;
  const records = readPendingAnswerQueue(userKey, storage);
  const next = records.filter((record) => !ids.has(record.clientAnswerId));
  writePendingAnswerQueue(userKey, next, storage);
}

export function selectPendingAnswersByPracticeSession(
  userKey: string,
  practiceSessionId: string,
  storage: QueueStorage | null = storageAvailable()
) {
  const sessionId = String(practiceSessionId || '').trim();
  if (!sessionId) return [];
  return readPendingAnswerQueue(userKey, storage).filter((record) => record.practiceSessionId === sessionId);
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
