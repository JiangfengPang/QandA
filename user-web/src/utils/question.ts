export type QuestionType = 'single' | 'multiple' | 'judge' | 'fill' | 'python' | string;

export type QuestionOption = {
  key?: string;
  keyLabel?: string;
  label?: string;
  text?: string;
  content?: string;
};

export type NormalizedQuestionOption = Omit<QuestionOption, 'key' | 'keyLabel' | 'text'> & {
  key: string;
  keyLabel: string;
  text: string;
};

export function normalizeOptions(options: QuestionOption[] = []): NormalizedQuestionOption[] {
  return options.map((option) => ({
    ...option,
    key: String(option.key || option.label || option.keyLabel || ''),
    keyLabel: String(option.keyLabel || option.key || option.label || ''),
    text: String(option.text || option.content || '')
  }));
}

export function judgeAnswerKey(value: unknown) {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (['a', 'true', 't', '1', 'yes', 'right', 'correct', '正确', '对', '是'].includes(normalized)) return 'A';
  if (['b', 'false', 'f', '0', 'no', 'wrong', 'incorrect', '错误', '错', '否'].includes(normalized)) return 'B';
  return String(value ?? '');
}

export function judgeOptionDisplay(value: unknown) {
  const key = judgeAnswerKey(value);
  if (key === 'A') return '正确';
  if (key === 'B') return '错误';
  return String(value ?? '');
}

export function optionKeyDisplay(option: Partial<NormalizedQuestionOption> | QuestionOption, questionType?: QuestionType) {
  const raw = (option as any).keyLabel || (option as any).key || (option as any).label || '';
  if (questionType === 'judge') return judgeAnswerKey(raw);
  return String(raw);
}

export function questionTypeText(questionOrType: any) {
  const type = typeof questionOrType === 'object' && questionOrType !== null ? questionOrType.type : questionOrType;
  const label = typeof questionOrType === 'object' && questionOrType !== null ? questionOrType.typeLabel : '';
  return label || ({ single: '单选', multiple: '多选', judge: '判断', fill: '填空', python: 'Python题', reading: '阅读理解' } as Record<string, string>)[type] || '题目';
}

export function difficultyText(difficulty: string) {
  return ({ easy: '基础', medium: '进阶', hard: '挑战' } as Record<string, string>)[difficulty] || '基础';
}

export function simpleExplanation(text: string) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .replace(/^正确答案[:：][^。]*。?\s*/g, '')
    .replace(/^答案[:：][^。]*。?\s*/g, '')
    .replace(/^考点[:：][^。]*。?\s*/g, '')
    .trim();
}
