import { prisma } from '../db/prisma.js';
import { normalizeJudgeAnswerKey, judgeOptionTextByKey } from '../utils/judge.js';
import { normalizeAnswer } from '../utils/answer.js';
import { isObjectiveQuestionType, normalizeAnswerForObjectiveType, normalizeSelectedForPracticeStorage } from '../utils/answerNormalization.js';

function normalizeAnswerArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
  if (value === null || value === undefined) return [];
  return [String(value).trim()].filter(Boolean);
}

function normalizeAnswerGroups(value: unknown): string[][] {
  if (!Array.isArray(value) || !value.some((item) => Array.isArray(item))) return [];
  return value
    .map((item) => normalizeAnswerArray(item))
    .filter((group) => group.length > 0);
}

function normalizePronunciationConfig(value: unknown, fallbackText = '') {
  if (typeof value === 'string') {
    const text = value.trim();
    return text ? { text, lang: 'en-US' } : undefined;
  }
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const raw = value as Record<string, unknown>;
  const text = String(raw.text ?? raw.word ?? raw.value ?? raw.speakText ?? fallbackText ?? '').trim();
  if (!text) return undefined;
  return {
    text,
    lang: String(raw.lang || raw.language || 'en-US').trim() || 'en-US',
    phonetic: raw.phonetic ? String(raw.phonetic) : undefined
  };
}

function rawQuestionBlanks(question: any) {
  const raw = question.rawJson && typeof question.rawJson === 'object' ? question.rawJson : {};
  return Array.isArray(raw.blanks) ? raw.blanks : [];
}

function fillBlankDefinitions(question: any) {
  if (question.type !== 'fill') return [];
  const rawBlanks = rawQuestionBlanks(question);
  const answerGroups = normalizeAnswerGroups(question.answerJson);
  if (rawBlanks.length) {
    return rawBlanks
      .map((blank: any, index: number) => {
        const answer = normalizeAnswerArray(blank.answer ?? answerGroups[index]);
        return {
          id: String(blank.id || `blank-${index + 1}`),
          label: String(blank.label || index + 1),
          prompt: blank.prompt ? String(blank.prompt) : '',
          answer,
          pronunciation: normalizePronunciationConfig(blank.pronunciation, answer[0])
        };
      })
      .filter((blank: any) => blank.answer.length > 0);
  }

  if (answerGroups.length > 1) {
    return answerGroups.map((answer, index) => ({
      id: `blank-${index + 1}`,
      label: String(index + 1),
      prompt: '',
      answer,
      pronunciation: undefined
    }));
  }

  const singleAnswer = normalizeAnswerArray(question.answerJson);
  return singleAnswer.length ? [{ id: 'blank-1', label: '1', prompt: '', answer: singleAnswer, pronunciation: undefined }] : [];
}

function fillAnswerDisplayArray(question: any) {
  const blanks = fillBlankDefinitions(question);
  if (blanks.length > 1) return blanks.map((blank) => blank.answer.join(' / '));
  return blanks[0]?.answer || [];
}

function questionAnswerArray(question: any) {
  if (question.type === 'fill') return fillAnswerDisplayArray(question);
  const raw = Array.isArray(question.answerJson)
    ? question.answerJson
    : (question.answerJson === null || typeof question.answerJson === 'undefined' ? [] : [question.answerJson]);
  if (question.type === 'python') return raw.map((item: unknown) => String(item));
  return isObjectiveQuestionType(question.type) ? normalizeAnswerForObjectiveType(question.type, question.answerJson) : normalizeAnswer(raw);
}

function optionLabelDisplay(option: any, questionType?: string) {
  const label = option?.label ?? option?.key ?? option?.keyLabel ?? '';
  if (questionType === 'judge') return normalizeJudgeAnswerKey(label);
  return String(label);
}

function optionContentDisplay(option: any, questionType?: string) {
  const content = option?.content ?? option?.text ?? '';
  if (questionType === 'judge') return judgeOptionTextByKey(optionLabelDisplay(option, questionType) || content);
  return String(content);
}

function optionMatchesAnswer(option: any, answer: string, questionType?: string) {
  if (questionType === 'judge') return optionLabelDisplay(option, questionType) === normalizeJudgeAnswerKey(answer);
  return option.label === answer || option.key === answer || option.keyLabel === answer;
}

function answerTextByOptions(selected: unknown, options: any[], questionType?: string) {
  const values = questionType && isObjectiveQuestionType(questionType)
    ? normalizeSelectedForPracticeStorage(questionType, selected)
    : normalizeAnswerArray(selected);
  if (!values.length) return '';
  return values
    .map((answer) => {
      const option = (options || []).find((item: any) => optionMatchesAnswer(item, answer, questionType));
      if (option) return `${optionLabelDisplay(option, questionType)}. ${optionContentDisplay(option, questionType)}`;
      if (questionType === 'judge') return `${normalizeJudgeAnswerKey(answer)}. ${judgeOptionTextByKey(answer)}`;
      return answer;
    })
    .join('，');
}

function readingPayload(question: any) {
  if (question.type !== 'reading') return {};
  const raw = question.rawJson && typeof question.rawJson === 'object' && !Array.isArray(question.rawJson)
    ? question.rawJson
    : {};
  return {
    passageId: String(raw.passageId || ''),
    readingPassage: String(raw.readingPassage || ''),
    readingQuestion: String(raw.readingQuestion || '')
  };
}

export function formatQuestion(question: any, userId?: string) {
  const answer = questionAnswerArray(question);
  const fillBlanks = fillBlankDefinitions(question);
  const rawJson = question.rawJson && typeof question.rawJson === 'object' ? question.rawJson : {};
  const pronunciation = normalizePronunciationConfig(rawJson.pronunciation, answer[0]);
  const optionRows = question.options || [];
  const latestAnswer = Array.isArray(question.answers) && question.answers.length ? question.answers[0] : null;
  const bank = question.bank || null;
  const subject = bank?.subject || null;
  return {
    id: question.id,
    bankId: question.bankId,
    bankName: bank?.name || undefined,
    unitName: bank?.name || undefined,
    unitSortOrder: typeof bank?.sortOrder === 'number' ? bank.sortOrder : undefined,
    questionSortOrder: typeof question.sortOrder === 'number' ? question.sortOrder : undefined,
    subjectId: bank?.subjectId || subject?.id || undefined,
    subjectName: subject?.name || undefined,
    legacyId: question.legacyId,
    type: question.type,
    typeLabel: question.typeLabel,
    difficulty: question.difficulty,
    score: question.score,
    question: question.stem,
    stem: question.stem,
    ...readingPayload(question),
    answer,
    pronunciation,
    fillBlanks: question.type === 'fill' ? fillBlanks : undefined,
    tags: Array.isArray(question.tagsJson) ? question.tagsJson : [],
    explanation: question.explanation,
    options: optionRows.map((option: any) => ({
      id: option.id,
      key: optionLabelDisplay(option, question.type),
      keyLabel: optionLabelDisplay(option, question.type),
      text: optionContentDisplay(option, question.type),
      isCorrect: answer.includes(optionLabelDisplay(option, question.type))
    })),
    favorite: userId ? Boolean(question.favorites?.length) : false,
    wrongCount: userId && question.wrongs?.[0] ? question.wrongs[0].wrongCount : 0,
    userAnswer: latestAnswer ? normalizeSelectedForPracticeStorage(question.type, latestAnswer.selectedJson) : undefined,
    userAnswerText: latestAnswer ? answerTextByOptions(latestAnswer.selectedJson, optionRows, question.type) : undefined,
    lastAnsweredAt: latestAnswer?.createdAt || undefined
  };
}

export async function getBankQuestions(bankId: string, userId?: string) {
  const questions = await prisma.question.findMany({
    where: { bankId, isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    include: {
      bank: { include: { subject: true } },
      options: { orderBy: { sortOrder: 'asc' } },
      favorites: userId ? { where: { userId } } : false,
      wrongs: userId ? { where: { userId } } : false,
      answers: userId ? { where: { userId }, orderBy: { createdAt: 'desc' }, take: 1 } : false
    }
  });
  return questions.map((item) => formatQuestion(item, userId));
}

export async function getSubjectQuestions(subjectId: string, userId?: string) {
  const banks = await prisma.bank.findMany({
    where: { subjectId, isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    include: {
      subject: true,
      questions: {
        where: { isActive: true },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        include: {
          bank: { include: { subject: true } },
          options: { orderBy: { sortOrder: 'asc' } },
          favorites: userId ? { where: { userId } } : false,
          wrongs: userId ? { where: { userId } } : false,
          answers: userId ? { where: { userId }, orderBy: { createdAt: 'desc' }, take: 1 } : false
        }
      }
    }
  });

  return banks.flatMap((bank) => bank.questions.map((question) => formatQuestion(question, userId)));
}
