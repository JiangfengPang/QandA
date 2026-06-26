type ResumeStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export type PracticeResumeQuestion = {
  id?: unknown;
};

export type PracticeResumeSessionRecord = {
  correct: boolean;
  userAnswer: string[];
  answer: string[];
  explanation: string;
  clientAnswerId?: string;
  syncStatus?: 'pending' | 'synced' | 'failed';
};

export type PracticeResumeSnapshot = {
  version: 1;
  currentIndex: number;
  questionId: string;
  questionIds: string[];
  sessionRecords?: Record<string, PracticeResumeSessionRecord>;
  updatedAt: string;
};

const STORAGE_PREFIX = 'qanda_practice_resume:';

function storageAvailable(): ResumeStorage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

function encodeKeyPart(value: unknown) {
  const text = String(value ?? '').trim() || '_';
  return encodeURIComponent(text);
}

function questionId(question: PracticeResumeQuestion | null | undefined) {
  return String(question?.id ?? '').trim();
}

function questionIds(questions: PracticeResumeQuestion[]) {
  return questions.map(questionId).filter(Boolean);
}

function normalizeSessionRecord(record: PracticeResumeSessionRecord | null | undefined) {
  if (!record || typeof record.correct !== 'boolean') return null;
  return {
    correct: record.correct,
    userAnswer: Array.isArray(record.userAnswer) ? record.userAnswer.map((item) => String(item)) : [],
    answer: Array.isArray(record.answer) ? record.answer.map((item) => String(item)) : [],
    explanation: String(record.explanation || ''),
    clientAnswerId: record.clientAnswerId ? String(record.clientAnswerId) : undefined,
    syncStatus: record.syncStatus === 'pending' || record.syncStatus === 'synced' || record.syncStatus === 'failed'
      ? record.syncStatus
      : undefined
  };
}

function normalizeSessionRecords(value: unknown) {
  const source = value && typeof value === 'object' ? value as Record<string, PracticeResumeSessionRecord> : {};
  const records: Record<string, PracticeResumeSessionRecord> = {};

  for (const [id, record] of Object.entries(source)) {
    const questionKey = String(id || '').trim();
    const normalized = normalizeSessionRecord(record);
    if (!questionKey || !normalized) continue;
    records[questionKey] = normalized;
  }

  return records;
}

function parseSnapshot(value: string | null): PracticeResumeSnapshot | null {
  if (!value) return null;

  try {
    const parsed = JSON.parse(value) as PracticeResumeSnapshot;
    if (parsed?.version !== 1) return null;
    if (!Number.isInteger(parsed.currentIndex)) return null;
    if (!String(parsed.questionId || '').trim()) return null;
    if (!Array.isArray(parsed.questionIds)) return null;
    return {
      version: 1,
      currentIndex: parsed.currentIndex,
      questionId: String(parsed.questionId),
      questionIds: parsed.questionIds.map((item) => String(item)).filter(Boolean),
      sessionRecords: normalizeSessionRecords(parsed.sessionRecords),
      updatedAt: String(parsed.updatedAt || '')
    };
  } catch {
    return null;
  }
}

export function practiceResumeUpdatedAt(snapshot: PracticeResumeSnapshot | null | undefined) {
  const timestamp = Date.parse(String(snapshot?.updatedAt || ''));
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export function newerPracticeResume(
  left: PracticeResumeSnapshot | null | undefined,
  right: PracticeResumeSnapshot | null | undefined
) {
  if (!left) return right || null;
  if (!right) return left;
  return practiceResumeUpdatedAt(right) > practiceResumeUpdatedAt(left) ? right : left;
}

export function buildPracticeResumeKey(userKey: unknown, parts: unknown[]) {
  return `${STORAGE_PREFIX}${[userKey || 'anonymous', ...parts].map(encodeKeyPart).join(':')}`;
}

export function readPracticeResume(key: string, storage: ResumeStorage | null = storageAvailable()) {
  if (!key || !storage) return null;
  return parseSnapshot(storage.getItem(key));
}

export function savePracticeResume(
  key: string,
  questions: PracticeResumeQuestion[],
  currentIndex: number,
  sessionRecords?: Record<string, PracticeResumeSessionRecord>,
  storage: ResumeStorage | null = storageAvailable()
) {
  if (!key || !storage || !questions.length) return null;

  const safeIndex = Math.max(0, Math.min(currentIndex, questions.length - 1));
  const currentQuestionId = questionId(questions[safeIndex]);
  if (!currentQuestionId) return null;

  const ids = questionIds(questions);
  const records = normalizeSessionRecords(sessionRecords);
  const filteredRecords: Record<string, PracticeResumeSessionRecord> = {};

  for (const id of ids) {
    const record = records[id];
    if (record) filteredRecords[id] = record;
  }

  const snapshot: PracticeResumeSnapshot = {
    version: 1,
    currentIndex: safeIndex,
    questionId: currentQuestionId,
    questionIds: ids,
    sessionRecords: filteredRecords,
    updatedAt: new Date().toISOString()
  };

  try {
    storage.setItem(key, JSON.stringify(snapshot));
  } catch {
    // Practice must keep working even when localStorage is full or disabled.
  }

  return snapshot;
}

export function writePracticeResumeSnapshot(
  key: string,
  snapshot: PracticeResumeSnapshot | null,
  storage: ResumeStorage | null = storageAvailable()
) {
  if (!key || !snapshot || !storage) return;
  try {
    storage.setItem(key, JSON.stringify(snapshot));
  } catch {
    // Ignore storage errors.
  }
}

export function clearPracticeResume(key: string, storage: ResumeStorage | null = storageAvailable()) {
  if (!key || !storage) return;
  try {
    storage.removeItem(key);
  } catch {
    // Ignore storage errors.
  }
}

export function resolvePracticeResumeIndex(
  key: string,
  questions: PracticeResumeQuestion[],
  storage: ResumeStorage | null = storageAvailable()
) {
  const snapshot = readPracticeResume(key, storage);
  return resolvePracticeResumeSnapshotIndex(snapshot, questions);
}

export function resolvePracticeResumeSnapshotIndex(
  snapshot: PracticeResumeSnapshot | null,
  questions: PracticeResumeQuestion[]
) {
  if (!snapshot || !questions.length) return null;

  const byId = new Map<string, number>();
  questions.forEach((question, index) => {
    const id = questionId(question);
    if (id && !byId.has(id)) byId.set(id, index);
  });

  const matchedIndex = byId.get(snapshot.questionId);
  if (typeof matchedIndex === 'number') return matchedIndex;

  if (snapshot.currentIndex >= 0 && snapshot.currentIndex < questions.length) {
    return snapshot.currentIndex;
  }

  return null;
}

export function readPracticeResumeSessionRecords(
  key: string,
  questions: PracticeResumeQuestion[],
  storage: ResumeStorage | null = storageAvailable()
) {
  const snapshot = readPracticeResume(key, storage);
  return practiceResumeSessionRecordsFromSnapshot(snapshot, questions);
}

export function practiceResumeSessionRecordsFromSnapshot(
  snapshot: PracticeResumeSnapshot | null,
  questions: PracticeResumeQuestion[]
) {
  if (!snapshot?.sessionRecords || !questions.length) return {};

  const validQuestionIds = new Set(questionIds(questions));
  const records: Record<string, PracticeResumeSessionRecord> = {};

  for (const [id, record] of Object.entries(snapshot.sessionRecords)) {
    if (!validQuestionIds.has(id)) continue;
    records[id] = record;
  }

  return records;
}

export function applySavedPracticeQuestionOrder<T extends PracticeResumeQuestion>(
  key: string,
  questions: T[],
  storage: ResumeStorage | null = storageAvailable()
) {
  const snapshot = readPracticeResume(key, storage);
  return applyPracticeResumeSnapshotQuestionOrder(snapshot, questions);
}

export function applyPracticeResumeSnapshotQuestionOrder<T extends PracticeResumeQuestion>(
  snapshot: PracticeResumeSnapshot | null,
  questions: T[]
) {
  if (!snapshot?.questionIds.length || !questions.length) return null;

  const remaining = new Map<string, T>();
  for (const question of questions) {
    const id = questionId(question);
    if (id && !remaining.has(id)) remaining.set(id, question);
  }

  const ordered: T[] = [];
  for (const id of snapshot.questionIds) {
    const matched = remaining.get(id);
    if (!matched) continue;
    ordered.push(matched);
    remaining.delete(id);
  }

  if (!ordered.length) return null;

  for (const question of questions) {
    const id = questionId(question);
    if (!id || !remaining.has(id)) continue;
    ordered.push(question);
    remaining.delete(id);
  }

  return ordered;
}
