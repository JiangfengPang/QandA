export type FillMode = 'single' | 'multi';
export type FillAnswerPayload = string[] | string[][];

export function normalizeFillMode(mode: unknown): FillMode {
  return mode === 'multi' ? 'multi' : 'single';
}

function cleanAnswer(value: unknown) {
  return String(value ?? '').trim();
}

export function isMultiFillAnswer(value: unknown) {
  return Array.isArray(value) && value.some((item) => Array.isArray(item));
}

export function toSingleFillAnswers(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .flatMap((item) => (Array.isArray(item) ? item : [item]))
    .map(cleanAnswer)
    .filter(Boolean);
}

export function toMultiFillAnswers(value: unknown) {
  if (!Array.isArray(value)) return [];
  if (isMultiFillAnswer(value)) {
    return value
      .map((item) => (Array.isArray(item) ? item : [item]))
      .map((group) => group.map(cleanAnswer).filter(Boolean))
      .filter((group) => group.length > 0);
  }
  return value
    .map((item) => cleanAnswer(item))
    .filter(Boolean)
    .map((item) => [item]);
}

export function normalizeFillAnswerPayload(value: unknown, mode: FillMode): FillAnswerPayload {
  return mode === 'multi' ? toMultiFillAnswers(value) : toSingleFillAnswers(value);
}
