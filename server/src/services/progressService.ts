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
};

export type BankProgress = ReturnType<typeof summarizeLatestAnswers> & {
  wrongQuestionCount: number;
};

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

export function summarizeBankProgress(
  bankIds: string[],
  answerRecords: BankAnswerSummaryInput[],
  wrongRecords: BankWrongSummaryInput[]
) {
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

  const [answerRecords, wrongRecords] = await Promise.all([
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
      select: { question: { select: { bankId: true } } }
    })
  ]);

  return summarizeBankProgress(
    uniqueBankIds,
    answerRecords.map((record) => ({ ...record, bankId: record.question.bankId })),
    wrongRecords.map((record) => ({ bankId: record.question.bankId }))
  );
}

export async function getBankProgress(userId: string, bankId: string) {
  const progress = await getBanksProgress(userId, [bankId]);
  return progress.get(bankId) || {
    ...summarizeLatestAnswers([]),
    wrongQuestionCount: 0
  };
}
