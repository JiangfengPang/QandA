import { prisma } from '../db/prisma.js';
import { addDays, dayKey, dayLabel, dayStart, sumRecordedDurationSeconds } from '../utils/date.js';
import { effectiveQuestionCount, effectiveQuestionCountsByBank, summarizeEffectiveAnswers } from './progressService.js';

type ScopedQuestionFilter = {
  isActive?: boolean;
  bank?: { subjectId?: string; isActive?: boolean; subject?: { isActive?: boolean } };
};

function buildQuestionFilter(subjectId?: string): ScopedQuestionFilter {
  return subjectId
    ? { isActive: true, bank: { subjectId, isActive: true, subject: { isActive: true } } }
    : { isActive: true, bank: { isActive: true, subject: { isActive: true } } };
}

function buildDailyTrend(records: Array<{ createdAt: Date; isCorrect: boolean }>) {
  const today = dayStart(new Date());
  const trendStart = addDays(today, -6);
  const trendMap = new Map<string, { answerCount: number; correctCount: number }>();

  for (let index = 0; index < 7; index += 1) {
    const date = addDays(trendStart, index);
    trendMap.set(dayKey(date), { answerCount: 0, correctCount: 0 });
  }

  for (const answer of records) {
    const key = dayKey(answer.createdAt);
    const row = trendMap.get(key);
    if (!row) continue;
    row.answerCount += 1;
    if (answer.isCorrect) row.correctCount += 1;
  }

  return Array.from(trendMap.entries()).map(([key, value]) => {
    const date = new Date(`${key}T00:00:00`);
    return {
      date: key,
      label: dayLabel(date),
      answerCount: value.answerCount,
      correctCount: value.correctCount,
      accuracy: value.answerCount ? Math.round((value.correctCount / value.answerCount) * 100) : 0
    };
  });
}

export async function getPracticeStats(userId: string, subjectId?: string) {
  const questionFilter = buildQuestionFilter(subjectId);
  const today = dayStart(new Date());
  const trendStart = addDays(today, -6);

  const [subjects, banks, favoriteRecords, wrongRecords, answerRecords, trendAnswers, recentAnswer] = await Promise.all([
    prisma.subject.findMany({
      where: { isActive: true, ...(subjectId ? { id: subjectId } : {}) },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, name: true }
    }),
    prisma.bank.findMany({
      where: subjectId
        ? { subjectId, isActive: true, subject: { isActive: true } }
        : { isActive: true, subject: { isActive: true } },
      select: {
        id: true,
        subjectId: true,
        questions: {
          where: { isActive: true },
          select: { id: true, bankId: true, type: true, rawJson: true }
        }
      }
    }),
    prisma.userFavorite.findMany({
      where: { userId, question: questionFilter },
      select: { question: { select: { bank: { select: { subjectId: true } } } } }
    }),
    prisma.wrongQuestion.findMany({
      where: { userId, question: questionFilter },
      select: { questionId: true, question: { select: { bank: { select: { subjectId: true } } } } }
    }),
    prisma.userAnswer.findMany({
      where: { userId, question: questionFilter },
      orderBy: { createdAt: 'desc' },
      select: {
        questionId: true,
        isCorrect: true,
        durationSeconds: true,
        createdAt: true,
        question: { select: { bank: { select: { subjectId: true } } } }
      }
    }),
    prisma.userAnswer.findMany({
      where: { userId, question: questionFilter, createdAt: { gte: trendStart } },
      select: { createdAt: true, isCorrect: true },
      orderBy: { createdAt: 'asc' }
    }),
    prisma.userAnswer.findFirst({
      where: { userId, question: questionFilter },
      orderBy: { createdAt: 'desc' },
      select: {
        createdAt: true,
        question: {
          select: {
            bank: {
              select: {
                id: true,
                name: true,
                subjectId: true,
                subject: { select: { name: true } },
                _count: { select: { questions: { where: { isActive: true } } } }
              }
            }
          }
        }
      }
    })
  ]);

  const effectiveQuestions = banks.flatMap((bank) => bank.questions.map((question) => ({
    ...question,
    subjectId: bank.subjectId
  })));
  const effectiveCountsByBank = effectiveQuestionCountsByBank(effectiveQuestions);
  const summary = summarizeEffectiveAnswers(effectiveQuestions, answerRecords, wrongRecords);
  const totalBySubject = new Map<string, number>();
  const favoriteBySubject = new Map<string, number>();

  for (const bank of banks) {
    totalBySubject.set(bank.subjectId, (totalBySubject.get(bank.subjectId) || 0) + effectiveQuestionCount(bank.questions));
  }
  for (const record of favoriteRecords) {
    const id = record.question.bank.subjectId;
    favoriteBySubject.set(id, (favoriteBySubject.get(id) || 0) + 1);
  }

  const subjectStats = subjects.map((subject) => {
    const subjectQuestions = effectiveQuestions.filter((question) => question.subjectId === subject.id);
    const latestSummary = summarizeEffectiveAnswers(
      subjectQuestions,
      answerRecords.filter((record) => record.question.bank.subjectId === subject.id),
      wrongRecords.filter((record) => record.question.bank.subjectId === subject.id)
    );

    return {
      id: subject.id,
      name: subject.name,
      totalQuestionCount: totalBySubject.get(subject.id) || 0,
      answerCount: latestSummary.answerCount,
      correctCount: latestSummary.correctCount,
      wrongCount: latestSummary.wrongCount,
      accuracy: latestSummary.accuracy,
      wrongQuestionCount: latestSummary.wrongQuestionCount,
      favoriteCount: favoriteBySubject.get(subject.id) || 0
    };
  });

  const weakSubjects = subjectStats
    .filter((item) => item.answerCount > 0 && (item.accuracy < 60 || item.wrongQuestionCount > 0))
    .sort((a, b) => b.wrongQuestionCount - a.wrongQuestionCount || a.accuracy - b.accuracy || b.answerCount - a.answerCount)
    .slice(0, 4);

  const subjectOverview = subjectStats.reduce((acc, item) => {
    const total = Number(item.totalQuestionCount || 0);
    const answered = Number(item.answerCount || 0);
    if (!total || !answered) {
      acc.notStarted += 1;
    } else if (answered >= total) {
      acc.completed += 1;
    } else {
      acc.inProgress += 1;
    }
    return acc;
  }, { notStarted: 0, inProgress: 0, completed: 0 });

  const recentBank = recentAnswer?.question.bank
    ? {
        id: recentAnswer.question.bank.id,
        subjectId: recentAnswer.question.bank.subjectId,
        subjectName: recentAnswer.question.bank.subject.name,
        name: recentAnswer.question.bank.name,
        questionCount: effectiveCountsByBank.get(recentAnswer.question.bank.id) || 0,
        lastAnsweredAt: recentAnswer.createdAt
      }
    : null;

  return {
    answerCount: summary.answerCount,
    answerRecordCount: answerRecords.length,
    correctCount: summary.correctCount,
    wrongCount: summary.wrongCount,
    accuracy: summary.accuracy,
    favoriteCount: favoriteRecords.length,
    wrongQuestionCount: summary.wrongQuestionCount,
    totalQuestionCount: banks.reduce((sum, bank) => sum + effectiveQuestionCount(bank.questions), 0),
    subjectCount: subjects.length,
    bankCount: banks.length,
    totalDurationSeconds: sumRecordedDurationSeconds(answerRecords),
    dailyTrend: buildDailyTrend(trendAnswers),
    subjectStats,
    weakSubjects,
    subjectOverview,
    recentBank
  };
}

export async function getPracticeReviewSummary(userId: string) {
  const questionFilter = buildQuestionFilter();
  const [wrongQuestionCount, favoriteCount] = await Promise.all([
    prisma.wrongQuestion.count({ where: { userId, question: questionFilter } }),
    prisma.userFavorite.count({ where: { userId, question: questionFilter } })
  ]);
  return { wrongQuestionCount, favoriteCount };
}
