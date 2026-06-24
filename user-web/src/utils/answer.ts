function normalizeToken(value: unknown) {
  const text = String(value ?? '').trim();
  if (/^[a-z]$/i.test(text)) return text.toUpperCase();
  return text;
}

export function normalizeAnswer(value: unknown): string[] {
  const raw = Array.isArray(value) ? value : (value === null || value === undefined ? [] : [value]);
  const unique = new Set(raw.map(normalizeToken).filter(Boolean));
  return Array.from(unique).sort((a, b) => a.localeCompare(b, 'zh-CN'));
}

export function isAnswerCorrect(selected: unknown, answer: unknown) {
  const a = normalizeAnswer(selected);
  const b = normalizeAnswer(answer);
  if (a.length !== b.length) return false;
  return a.every((item, index) => item === b[index]);
}
