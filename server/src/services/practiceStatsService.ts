import { prisma } from '../db/prisma.js';
import { addDays, dayKey, dayLabel, dayStart, sumRecordedDurationSeconds } from '../utils/date.js';
import { summarizeLatestAnswers } from './progressService.js';

type ScopedQuestionFilter = {
  isActive?: boolean;
  bank?: { subjectId?: string; isActive?: boolean; subject?: { isActive?: boolean } };
};

type LatestAnswerRecord = {
  questionId: string;
  isCorrect: boolean;
  durationSeconds?: number | null;
  createdAt: Date;
  question: { bank: { subjectId: string } };
};

function buildQuestionFilter(subjectId?: string): ScopedQuestionFilter {
  return subjectId
    ? { isActive: true, bank: { subjectId, isActive: true, subject: { isActive: true } } }
    : { isActive: true, bank: { isActive: true, subject: { isActive: true } } };
}

function latestAnswerMap(records: LatestAnswerRecord[]) {
  const map = new Map<string, LatestAnswerRecord>();
  for (const record of records) {
    const current = map.get(record.questionId);
    if (!current || record.createdAt.getTime() > current.createdAt.getTime()) {
      map.set(record.questionId, record);
    }
  }
  return map;
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
        subjectId: true,
        _count: { select: { questions: { where: { isActive: true } } } }
      }
    }),
    prisma.userFavorite.findMany({
      where: { userId, question: questionFilter },
      select: { question: { select: { bank: { select: { subjectId: true } } } } }
    }),
    prisma.wrongQuestion.findMany({
      where: { userId, question: questionFilter },
      select: { question: { select: { bank: { select: { subjectId: true } } } } }
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

  const latest = latestAnswerMap(answerRecords);
  const summary = summarizeLatestAnswers(Array.from(latest.values()));
  const totalBySubject = new Map<string, number>();
  const wrongBySubject = new Map<string, number>();
  const favoriteBySubject = new Map<string, number>();

  for (const bank of banks) {
    totalBySubject.set(bank.subjectId, (totalBySubject.get(bank.subjectId) || 0) + bank._count.questions);
  }
  for (const record of wrongRecords) {
    const id = record.question.bank.subjectId;
    wrongBySubject.set(id, (wrongBySubject.get(id) || 0) + 1);
  }
  for (const record of favoriteRecords) {
    const id = record.question.bank.subjectId;
    favoriteBySubject.set(id, (favoriteBySubject.get(id) || 0) + 1);
  }

  const subjectStats = subjects.map((subject) => {
    const latestRows = Array.from(latest.values()).filter((record) => record.question.bank.subjectId === subject.id);
    const latestSummary = summarizeLatestAnswers(latestRows);

    return {
      id: subject.id,
      name: subject.name,
      totalQuestionCount: totalBySubject.get(subject.id) || 0,
      answerCount: latestSummary.answerCount,
      correctCount: latestSummary.correctCount,
      wrongCount: latestSummary.wrongCount,
      accuracy: latestSummary.accuracy,
      wrongQuestionCount: wrongBySubject.get(subject.id) || 0,
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
        questionCount: recentAnswer.question.bank._count.questions,
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
    wrongQuestionCount: wrongRecords.length,
    totalQuestionCount: banks.reduce((sum, bank) => sum + bank._count.questions, 0),
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
