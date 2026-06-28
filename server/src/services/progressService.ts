import { prisma } from '../db/prisma.js';

type AnswerSummaryInput = {
  questionId: string;
  isCorrect: boolean;
  createdAt: Date;
};

type BankAnswerSummaryInput = AnswerSummaryInput & {
  bankId: string;
};

type BankWrongSummaryInput = {
  bankId: string;
  questionId?: string;
};

type EffectiveQuestionInput = {
  id: string;
  bankId: string;
  subjectId?: string;
  type?: string | null;
  rawJson?: unknown;
};

export type BankProgress = ReturnType<typeof summarizeLatestAnswers> & {
  wrongQuestionCount: number;
};

function rawObject(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function normalizeKeyPart(value: unknown) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

export function effectiveQuestionKey(question: EffectiveQuestionInput) {
  if (question.type !== 'reading') return `question:${question.id}`;
  const raw = rawObject(question.rawJson);
  const passageId = normalizeKeyPart(raw.passageId);
  return `reading:${question.bankId}:${passageId || question.id}`;
}

export function effectiveQuestionCount(questions: EffectiveQuestionInput[]) {
  return new Set(questions.map((question) => effectiveQuestionKey(question))).size;
}

export function effectiveQuestionCountsByBank(questions: EffectiveQuestionInput[]) {
  const keysByBank = new Map<string, Set<string>>();
  for (const question of questions) {
    if (!keysByBank.has(question.bankId)) keysByBank.set(question.bankId, new Set());
    keysByBank.get(question.bankId)!.add(effectiveQuestionKey(question));
  }
  return new Map(Array.from(keysByBank.entries()).map(([bankId, keys]) => [bankId, keys.size]));
}

export function summarizeLatestAnswers(records: AnswerSummaryInput[]) {
  const latest = new Map<string, AnswerSummaryInput>();
  for (const record of records) {
    const current = latest.get(record.questionId);
    if (!current || record.createdAt.getTime() > current.createdAt.getTime()) {
      latest.set(record.questionId, record);
    }
  }

  const answerCount = latest.size;
  const correctCount = Array.from(latest.values()).filter((record) => record.isCorrect).length;
  const wrongCount = Math.max(answerCount - correctCount, 0);
  const accuracy = answerCount ? Math.round((correctCount / answerCount) * 100) : 0;

  return { latest, answerCount, correctCount, wrongCount, accuracy };
}

export function summarizeEffectiveAnswers(
  questions: EffectiveQuestionInput[],
  answerRecords: AnswerSummaryInput[],
  wrongRecords: Array<{ questionId?: string }> = []
) {
  if (!questions.length) return { ...summarizeLatestAnswers([]), wrongQuestionCount: 0 };

  const latest = summarizeLatestAnswers(answerRecords).latest;
  const groups = new Map<string, string[]>();
  const questionToGroupKey = new Map<string, string>();

  for (const question of questions) {
    const key = effectiveQuestionKey(question);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(question.id);
    questionToGroupKey.set(question.id, key);
  }

  let answerCount = 0;
  let correctCount = 0;

  for (const questionIds of groups.values()) {
    const latestAnswers = questionIds.map((id) => latest.get(id)).filter(Boolean) as AnswerSummaryInput[];
    if (latestAnswers.length !== questionIds.length) continue;
    answerCount += 1;
    if (latestAnswers.every((answer) => answer.isCorrect)) correctCount += 1;
  }

  const wrongGroupKeys = new Set<string>();
  for (const record of wrongRecords) {
    const groupKey = record.questionId ? questionToGroupKey.get(record.questionId) : undefined;
    if (groupKey) wrongGroupKeys.add(groupKey);
  }

  const wrongCount = Math.max(answerCount - correctCount, 0);
  const accuracy = answerCount ? Math.round((correctCount / answerCount) * 100) : 0;
  return { latest, answerCount, correctCount, wrongCount, accuracy, wrongQuestionCount: wrongGroupKeys.size };
}

export function summarizeBankProgress(
  bankIds: string[],
  answerRecords: BankAnswerSummaryInput[],
  wrongRecords: BankWrongSummaryInput[],
  questions?: EffectiveQuestionInput[]
) {
  if (questions?.length) {
    const questionsByBank = new Map<string, EffectiveQuestionInput[]>();
    for (const bankId of bankIds) questionsByBank.set(bankId, []);
    for (const question of questions) {
      if (!questionsByBank.has(question.bankId)) continue;
      questionsByBank.get(question.bankId)!.push(question);
    }

    return new Map(bankIds.map((bankId) => {
      const bankQuestions = questionsByBank.get(bankId) || [];
      return [bankId, summarizeEffectiveAnswers(
        bankQuestions,
        answerRecords.filter((record) => record.bankId === bankId),
        wrongRecords.filter((record) => record.bankId === bankId)
      )];
    }));
  }

  const latestByBank = new Map<string, Map<string, AnswerSummaryInput>>();
  const wrongCountByBank = new Map<string, number>();

  for (const bankId of bankIds) {
    latestByBank.set(bankId, new Map());
    wrongCountByBank.set(bankId, 0);
  }

  for (const record of answerRecords) {
    const latest = latestByBank.get(record.bankId);
    if (!latest) continue;
    const current = latest.get(record.questionId);
    if (!current || record.createdAt.getTime() > current.createdAt.getTime()) {
      latest.set(record.questionId, record);
    }
  }

  for (const record of wrongRecords) {
    if (!wrongCountByBank.has(record.bankId)) continue;
    wrongCountByBank.set(record.bankId, (wrongCountByBank.get(record.bankId) || 0) + 1);
  }

  return new Map(bankIds.map((bankId) => {
    const latest = Array.from(latestByBank.get(bankId)?.values() || []);
    return [bankId, {
      ...summarizeLatestAnswers(latest),
      wrongQuestionCount: wrongCountByBank.get(bankId) || 0
    }];
  }));
}

export async function getBanksProgress(userId: string, bankIds: string[]) {
  const uniqueBankIds = Array.from(new Set(bankIds.filter(Boolean)));
  if (!uniqueBankIds.length) return new Map<string, BankProgress>();

  const [answerRecords, wrongRecords, questionRows] = await Promise.all([
    prisma.userAnswer.findMany({
      where: {
        userId,
        question: {
          bankId: { in: uniqueBankIds },
          isActive: true,
          bank: { isActive: true, subject: { isActive: true } }
        }
      },
      select: {
        questionId: true,
        isCorrect: true,
        createdAt: true,
        question: { select: { bankId: true } }
      }
    }),
    prisma.wrongQuestion.findMany({
      where: {
        userId,
        question: {
          bankId: { in: uniqueBankIds },
          isActive: true,
          bank: { isActive: true, subject: { isActive: true } }
        }
      },
      select: { questionId: true, question: { select: { bankId: true } } }
    }),
    prisma.question.findMany({
      where: {
        bankId: { in: uniqueBankIds },
        isActive: true,
        bank: { isActive: true, subject: { isActive: true } }
      },
      select: { id: true, bankId: true, type: true, rawJson: true }
    })
  ]);

  return summarizeBankProgress(
    uniqueBankIds,
    answerRecords.map((record) => ({ ...record, bankId: record.question.bankId })),
    wrongRecords.map((record) => ({ bankId: record.question.bankId, questionId: record.questionId })),
    questionRows
  );
}

export async function getBankProgress(userId: string, bankId: string) {
  const progress = await getBanksProgress(userId, [bankId]);
  return progress.get(bankId) || {
    ...summarizeLatestAnswers([]),
    wrongQuestionCount: 0
  };
}
