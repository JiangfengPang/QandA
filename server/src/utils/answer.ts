function normalizeToken(value: unknown) {
  const text = String(value ?? '')
    .trim()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, '...')
    .replace(/\s+/g, ' ');
  if (/^[a-z]$/i.test(text)) return text.toUpperCase();
  return text.toLocaleLowerCase('en-US');
}

function expandCompactChoiceToken(value: unknown): string[] {
  const text = String(value ?? '').trim();
  const compact = text.replace(/[\s,，、;；/|]+/g, '');
  if (compact.length < 2 || !/^[A-H]+$/.test(compact)) return [String(value ?? '')];
  return compact.split('');
}

export function normalizeChoiceAnswerEntries(value: unknown): string[] {
  const raw = Array.isArray(value) ? value : (value === null || value === undefined ? [] : [value]);
  return raw.flatMap(expandCompactChoiceToken).map(normalizeToken).filter(Boolean);
}

function normalizeTextAnswerEntries(value: unknown): string[] {
  const raw = Array.isArray(value) ? value : (value === null || value === undefined ? [] : [value]);
  return raw.map(normalizeToken).filter(Boolean);
}

export function normalizeAnswer(value: unknown): string[] {
  const unique = new Set(normalizeChoiceAnswerEntries(value));
  return Array.from(unique).sort((a, b) => a.localeCompare(b, 'zh-CN'));
}

export function normalizeTextAnswer(value: unknown): string[] {
  const unique = new Set(normalizeTextAnswerEntries(value));
  return Array.from(unique).sort((a, b) => a.localeCompare(b, 'zh-CN'));
}

export function normalizeFillAnswerGroups(answer: unknown): string[][] {
  if (Array.isArray(answer) && answer.some((item) => Array.isArray(item))) {
    return answer
      .map((item) => normalizeTextAnswer(item))
      .filter((group) => group.length > 0);
  }
  const singleGroup = normalizeTextAnswer(answer);
  return singleGroup.length ? [singleGroup] : [];
}

export function isAnswerCorrect(selected: unknown, answer: unknown) {
  const a = normalizeAnswer(selected);
  const b = normalizeAnswer(answer);
  if (a.length !== b.length) return false;
  return a.every((item, index) => item === b[index]);
}

export function isFillAnswerCorrect(selected: unknown, answer: unknown) {
  const selectedValues = normalizeTextAnswerEntries(selected);
  const answerGroups = normalizeFillAnswerGroups(answer);
  if (!answerGroups.length) return false;
  if (answerGroups.length === 1) {
    return selectedValues.length === 1 && answerGroups[0].includes(selectedValues[0]);
  }
  if (selectedValues.length !== answerGroups.length) return false;
  return answerGroups.every((group, index) => group.includes(selectedValues[index]));
}
