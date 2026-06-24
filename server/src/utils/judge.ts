export const STANDARD_JUDGE_OPTIONS = [
  { label: 'A', content: '正确' },
  { label: 'B', content: '错误' }
] as const;

const TRUE_TOKENS = new Set(['a', 'true', 't', '1', 'yes', 'y', 'right', 'correct', '正确', '对', '是']);
const FALSE_TOKENS = new Set(['b', 'false', 'f', '0', 'no', 'n', 'wrong', 'incorrect', '错误', '错', '否']);

export function normalizeJudgeAnswerKey(value: unknown) {
  const raw = String(value ?? '').trim();
  const normalized = raw.toLowerCase();
  if (TRUE_TOKENS.has(normalized)) return 'A';
  if (FALSE_TOKENS.has(normalized)) return 'B';
  return raw;
}

export function normalizeJudgeAnswerArray(value: unknown): string[] {
  const raw = Array.isArray(value) ? value : (value === null || value === undefined ? [] : [value]);
  const result = raw.map(normalizeJudgeAnswerKey).filter(Boolean);
  return Array.from(new Set(result));
}

export function judgeOptionTextByKey(value: unknown) {
  const key = normalizeJudgeAnswerKey(value);
  if (key === 'A') return '正确';
  if (key === 'B') return '错误';
  return String(value ?? '');
}

export function normalizeJudgeOptionsForStorage() {
  return STANDARD_JUDGE_OPTIONS.map((option) => ({ ...option }));
}
