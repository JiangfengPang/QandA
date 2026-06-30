import { normalizeAnswer } from './answer.js';
import { normalizeJudgeAnswerArray } from './judge.js';
import { HttpError } from './http.js';

export const OBJECTIVE_QUESTION_TYPES = ['single', 'multiple', 'judge', 'reading'] as const;

export function isObjectiveQuestionType(type: string) {
  return (OBJECTIVE_QUESTION_TYPES as readonly string[]).includes(type);
}

export function normalizeRawAnswerInput(value: unknown, maxItemLength = 5000): string[] {
  const raw = Array.isArray(value)
    ? value
    : (value === null || value === undefined ? [] : [value]);
  return raw
    .map((item) => String(item))
    .filter((item) => item.length <= maxItemLength);
}

export function normalizeSelectedForPracticeStorage(type: string, selected: unknown): string[] {
  if (type === 'judge') return normalizeJudgeAnswerArray(selected);
  if (type === 'fill') return normalizeRawAnswerInput(selected);
  if (isObjectiveQuestionType(type)) return normalizeAnswer(selected);
  return normalizeRawAnswerInput(selected);
}

export function normalizeAnswerForObjectiveType(type: string, answer: unknown): string[] {
  if (type === 'judge') return normalizeJudgeAnswerArray(answer);
  if (isObjectiveQuestionType(type)) return normalizeAnswer(answer);
  return normalizeRawAnswerInput(answer);
}

export function normalizeAllowedLabelsForQuestionType(type: string, allowedLabels: unknown): string[] {
  const labels = normalizeRawAnswerInput(allowedLabels, 100);
  return type === 'judge' ? normalizeJudgeAnswerArray(labels) : labels;
}

export function assertPracticeSelectedAnswerAllowed(type: string, selectedForStorage: string[], allowedLabels: unknown) {
  if (!isObjectiveQuestionType(type)) return;
  const allowedLabelSet = new Set(normalizeAllowedLabelsForQuestionType(type, allowedLabels));
  if (selectedForStorage.some((item) => !allowedLabelSet.has(item))) {
    throw new HttpError('答案包含无效选项', 400);
  }
  if (['single', 'reading'].includes(type) && selectedForStorage.length > 1) {
    throw new HttpError('单选题只能选择一个答案', 400);
  }
}
