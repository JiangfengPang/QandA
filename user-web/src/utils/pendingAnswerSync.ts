import { api, postKeepalive } from '../api/request';
import {
  dedupePendingAnswerRecords,
  readPendingAnswerQueue,
  removePendingAnswersByClientAnswerIds,
  type PendingAnswerRecord
} from './pendingAnswerQueue';

export type PendingAnswerSyncResult = {
  clientAnswerId?: string;
  correct: boolean;
  answer: string[];
  explanation: string;
  recorded?: boolean;
  queued?: boolean;
};

export type PendingAnswerBatchResponse = {
  practiceSessionId?: string;
  clientSubmissionId?: string;
  accepted: number;
  queued?: number;
  submissionStatus?: string;
  results: PendingAnswerSyncResult[];
};

export type PendingAnswerBatchOptions = {
  practiceSessionId?: string;
  clientSubmissionId?: string;
  scopeType?: string;
  scopeId?: string;
  compact?: boolean;
};

export type PendingAnswerFlushOptions = {
  dispatchStatsUpdated?: boolean;
};

const pendingAnswerFlushByUserKey = new Map<string, Promise<number>>();

function randomSuffix() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function normalizeIdPart(value: unknown) {
  return String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9:_-]+/g, '-')
    .slice(0, 150);
}

export function createPendingAnswerClientSubmissionId(practiceSessionId: string) {
  return `${practiceSessionId || 'ps'}:${randomSuffix()}`.slice(0, 120);
}

export function resolvePendingAnswerPracticeSessionId(record: PendingAnswerRecord) {
  const existing = String(record.practiceSessionId || '').trim();
  if (existing) return existing.slice(0, 191);

  const fallback = normalizeIdPart(record.sessionKey || record.scope || record.questionId || 'unknown');
  return `ps:recovered:${fallback || randomSuffix()}`.slice(0, 191);
}

export function groupPendingAnswerRecordsByPracticeSession(records: PendingAnswerRecord[]) {
  const groups = new Map<string, PendingAnswerRecord[]>();
  for (const record of dedupePendingAnswerRecords(records)) {
    const practiceSessionId = resolvePendingAnswerPracticeSessionId(record);
    if (!groups.has(practiceSessionId)) groups.set(practiceSessionId, []);
    groups.get(practiceSessionId)!.push(record);
  }
  return [...groups.entries()].map(([practiceSessionId, sessionRecords]) => ({
    practiceSessionId,
    records: sessionRecords
  }));
}

function pendingAnswerPayload(record: PendingAnswerRecord, options: { compact?: boolean } = {}) {
  return {
    questionId: record.questionId,
    practiceSessionId: record.practiceSessionId,
    selected: record.selectedAnswer,
    clientAnswerId: record.clientAnswerId,
    durationSeconds: record.durationSeconds || 0,
    isCorrect: record.isCorrect,
    ...(options.compact ? {} : {
      answer: record.answer || [],
      explanation: record.explanation || ''
    })
  };
}

export function buildPendingAnswerBatchPayload(records: PendingAnswerRecord[], options: PendingAnswerBatchOptions = {}) {
  const uniqueRecords = dedupePendingAnswerRecords(records);
  const practiceSessionId = options.practiceSessionId
    || (uniqueRecords[0] ? resolvePendingAnswerPracticeSessionId(uniqueRecords[0]) : undefined);
  const clientSubmissionId = options.clientSubmissionId
    || (practiceSessionId ? createPendingAnswerClientSubmissionId(practiceSessionId) : undefined);

  return {
    practiceSessionId,
    clientSubmissionId,
    scopeType: options.scopeType || 'practice',
    scopeId: options.scopeId,
    answers: uniqueRecords.map((record) => pendingAnswerPayload(record, { compact: options.compact }))
  };
}

export function postPendingAnswerSessionKeepalive(records: PendingAnswerRecord[], options: PendingAnswerBatchOptions = {}) {
  const payload = buildPendingAnswerBatchPayload(records, { ...options, compact: true });
  if (!payload.practiceSessionId || !payload.answers.length) return false;
  postKeepalive('/practice/answers/batch', payload);
  return true;
}

export async function syncPendingAnswerSessions(userKey: string, records: PendingAnswerRecord[], options: PendingAnswerBatchOptions = {}) {
  const syncedClientAnswerIds: string[] = [];
  for (const group of groupPendingAnswerRecordsByPracticeSession(records)) {
    const payload = buildPendingAnswerBatchPayload(group.records, {
      ...options,
      practiceSessionId: group.practiceSessionId,
      clientSubmissionId: options.clientSubmissionId || createPendingAnswerClientSubmissionId(group.practiceSessionId)
    });
    if (!payload.answers.length) continue;
    await api.post<PendingAnswerBatchResponse>('/practice/answers/batch', payload);
    syncedClientAnswerIds.push(...group.records.map((record) => record.clientAnswerId));
  }

  if (syncedClientAnswerIds.length) {
    removePendingAnswersByClientAnswerIds(userKey, syncedClientAnswerIds);
  }

  return syncedClientAnswerIds.length;
}

export function requestPendingAnswerSessionFlush(userKey: string, options: PendingAnswerFlushOptions = {}) {
  const normalizedUserKey = String(userKey || '').trim();
  if (!normalizedUserKey) return Promise.resolve(0);

  const existing = pendingAnswerFlushByUserKey.get(normalizedUserKey);
  if (existing) return existing;

  const records = readPendingAnswerQueue(normalizedUserKey).filter((record) => record.status !== 'invalid');
  if (!records.length) return Promise.resolve(0);

  const flushPromise = syncPendingAnswerSessions(normalizedUserKey, records)
    .then((syncedCount) => {
      if (syncedCount > 0 && options.dispatchStatsUpdated && typeof window !== 'undefined') {
        window.dispatchEvent(new Event('qanda:stats-updated'));
      }
      return syncedCount;
    })
    .catch(() => 0)
    .finally(() => {
      if (pendingAnswerFlushByUserKey.get(normalizedUserKey) === flushPromise) {
        pendingAnswerFlushByUserKey.delete(normalizedUserKey);
      }
    });

  pendingAnswerFlushByUserKey.set(normalizedUserKey, flushPromise);
  return flushPromise;
}
