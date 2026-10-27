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

export const PENDING_ANSWER_BATCH_LIMIT = 500;
export const PENDING_ANSWER_BATCH_BYTES = 512 * 1024;
export const PENDING_ANSWER_KEEPALIVE_BYTES = 48 * 1024;

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

type PendingAnswerChunk = {
  records: PendingAnswerRecord[];
  payload: ReturnType<typeof buildPendingAnswerBatchPayload>;
};

export function buildPendingAnswerChunks(records: PendingAnswerRecord[], options: PendingAnswerBatchOptions = {}, maxBytes = PENDING_ANSWER_BATCH_BYTES) {
  const chunks: PendingAnswerChunk[] = [];
  for (const group of groupPendingAnswerRecordsByPracticeSession(records)) {
    let current: PendingAnswerRecord[] = [];
    const batchOptions = { ...options, practiceSessionId: group.practiceSessionId, compact: true };
    let payload = buildPendingAnswerBatchPayload([], batchOptions);
    const finish = () => {
      if (current.length) chunks.push({ records: current, payload });
      current = [];
      payload = buildPendingAnswerBatchPayload([], { ...batchOptions,
        clientSubmissionId: createPendingAnswerClientSubmissionId(group.practiceSessionId) });
    };
    for (const record of group.records) {
      const candidate = buildPendingAnswerBatchPayload([...current, record], {
        ...batchOptions, clientSubmissionId: payload.clientSubmissionId
      });
      if (current.length && (current.length >= PENDING_ANSWER_BATCH_LIMIT
        || new TextEncoder().encode(JSON.stringify(candidate)).byteLength > maxBytes)) finish();
      const next = buildPendingAnswerBatchPayload([...current, record], {
        ...batchOptions, clientSubmissionId: payload.clientSubmissionId
      });
      if (new TextEncoder().encode(JSON.stringify(next)).byteLength > maxBytes) {
        // Keep oversized records locally; ordinary requests can send larger records.
        if (maxBytes === PENDING_ANSWER_KEEPALIVE_BYTES) continue;
        throw new Error('单条答案超过提交大小限制，请检查答案内容');
      }
      current.push(record);
      payload = next;
    }
    finish();
  }
  return chunks;
}

export function postPendingAnswerSessionKeepalive(records: PendingAnswerRecord[], options: PendingAnswerBatchOptions = {}) {
  // One bounded request shares the browser's 64 KiB budget with other unload requests.
  const chunk = buildPendingAnswerChunks(records, options, PENDING_ANSWER_KEEPALIVE_BYTES)[0];
  if (!chunk) return false;
  // No acknowledgement on unload: retain every record for an idempotent retry.
  return postKeepalive('/practice/answers/batch', chunk.payload);
}

export type PendingAnswerSyncOptions = PendingAnswerBatchOptions & {
  onAccepted?: (records: PendingAnswerRecord[], data: PendingAnswerBatchResponse) => void;
};

export async function syncPendingAnswerSessions(userKey: string, records: PendingAnswerRecord[], options: PendingAnswerSyncOptions = {}) {
  let acceptedCount = 0;
  for (const chunk of buildPendingAnswerChunks(records, options)) {
    const data = await api.post<PendingAnswerBatchResponse>('/practice/answers/batch', chunk.payload);
    if (data.accepted !== chunk.records.length) throw new Error('部分答案尚未确认，请重试');
    removePendingAnswersByClientAnswerIds(userKey, chunk.records.map((record) => record.clientAnswerId));
    acceptedCount += chunk.records.length;
    options.onAccepted?.(chunk.records, data);
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('qanda:stats-updated'));
  }
  return acceptedCount;
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
