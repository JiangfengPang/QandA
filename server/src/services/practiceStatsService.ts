import { Prisma } from '@prisma/client';
import { env } from '../config/env.js';
import { prisma } from '../db/prisma.js';
import { addDays, dayStart } from '../utils/date.js';
import { buildDateBuckets, dateBucketCaseSql } from '../utils/sqlDateBuckets.js';
import { effectiveQuestionCount, effectiveQuestionCountsByBank, summarizeEffectiveAnswers } from './progressService.js';

type ScopedQuestionFilter = {
  isActive?: boolean;
  bank?: { subjectId?: string; isActive?: boolean; subject?: { isActive?: boolean } };
};

type DbNumeric = bigint | number | string | null | undefined;

type LatestAnswerRow = {
  questionId: string;
  isCorrect: boolean | number;
  createdAt: Date;
  bankId: string;
  subjectId: string;
};

type DailyTrendAggregateRow = {
  date: string;
  answerCount: DbNumeric;
  correctCount: DbNumeric;
};

type AnswerSummaryRow = {
  answerRecordCount: DbNumeric;
  totalDurationSeconds: DbNumeric;
};

type SubjectFavoriteRow = {
  subjectId: string;
  favoriteCount: DbNumeric;
};

export type PracticeReviewSummaryScope = {
  subjectId?: string;
  bankId?: string;
  scope?: string;
};

type PracticeReviewSummary = {
  wrongQuestionCount: number;
  favoriteCount: number;
  pendingAnswerCount: number;
  queuedAnswerCount: number;
  syncing: boolean;
};

const reviewSummaryCache = new Map<string, { expiresAt: number; value?: PracticeReviewSummary; promise?: Promise<PracticeReviewSummary> }>();

function buildQuestionFilter(subjectId?: string): ScopedQuestionFilter {
  return subjectId
    ? { isActive: true, bank: { subjectId, isActive: true, subject: { isActive: true } } }
    : { isActive: true, bank: { isActive: true, subject: { isActive: true } } };
}

function buildReviewQuestionFilter(scope: PracticeReviewSummaryScope = {}) {
  const subjectId = String(scope.subjectId || '').trim();
  const bankId = String(scope.bankId || '').trim();
  if (bankId) return { isActive: true, bankId, bank: { isActive: true, subject: { isActive: true } } };
  return buildQuestionFilter(subjectId || undefined);
}

function toNumber(value: DbNumeric) {
  if (value === null || value === undefined) return 0;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

function toBoolean(value: boolean | number) {
  return value === true || value === 1;
}

function subjectFilterSql(subjectId?: string) {
  return subjectId ? Prisma.sql`AND b.\`subjectId\` = ${subjectId}` : Prisma.empty;
}

function reviewSummaryCacheKey(userId: string, scope: PracticeReviewSummaryScope = {}) {
  return [
    userId,
    String(scope.scope || 'all').trim() || 'all',
    String(scope.subjectId || 'all-subjects').trim() || 'all-subjects',
    String(scope.bankId || 'all-banks').trim() || 'all-banks'
  ].join(':');
}

function buildDailyTrend(rows: DailyTrendAggregateRow[], trendStart: Date, days: number) {
  const rowsByDate = new Map(rows.map((row) => [
    row.date,
    {
      answerCount: toNumber(row.answerCount),
      correctCount: toNumber(row.correctCount)
    }
  ]));

  return buildDateBuckets(trendStart, days).map((bucket) => {
    const row = rowsByDate.get(bucket.key) || { answerCount: 0, correctCount: 0 };
    return {
      date: bucket.key,
      label: bucket.label,
      answerCount: row.answerCount,
      correctCount: row.correctCount,
      accuracy: row.answerCount ? Math.round((row.correctCount / row.answerCount) * 100) : 0
    };
  });
}

export async function getPracticeStats(userId: string, subjectId?: string) {
  const questionFilter = buildQuestionFilter(subjectId);
  const today = dayStart(new Date());
  const trendStart = addDays(today, -6);
  const tomorrow = addDays(today, 1);
  const scopedSubjectSql = subjectFilterSql(subjectId);
  const trendBucketSql = dateBucketCaseSql(Prisma.sql`ua.\`createdAt\``, buildDateBuckets(trendStart, 7));

  const [
    subjects,
    banks,
    favoriteSubjectRows,
    wrongRecords,
    answerSummaryRows,
    latestAnswerRows,
    trendRows,
    recentAnswer
  ] = await Promise.all([
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
    prisma.$queryRaw<SubjectFavoriteRow[]>(Prisma.sql`
      SELECT b.\`subjectId\`, COUNT(DISTINCT uf.\`questionId\`) AS \`favoriteCount\`
      FROM \`UserFavorite\` uf
      INNER JOIN \`Question\` q ON q.\`id\` = uf.\`questionId\`
      INNER JOIN \`Bank\` b ON b.\`id\` = q.\`bankId\`
      INNER JOIN \`Subject\` s ON s.\`id\` = b.\`subjectId\`
      WHERE uf.\`userId\` = ${userId}
        AND q.\`isActive\` = 1
        AND b.\`isActive\` = 1
        AND s.\`isActive\` = 1
        ${scopedSubjectSql}
      GROUP BY b.\`subjectId\`
    `),
    prisma.wrongQuestion.findMany({
      where: { userId, question: questionFilter },
      select: { questionId: true, question: { select: { bank: { select: { subjectId: true } } } } }
    }),
    prisma.$queryRaw<AnswerSummaryRow[]>(Prisma.sql`
      SELECT
        COUNT(ua.\`id\`) AS \`answerRecordCount\`,
        COALESCE(SUM(ua.\`durationSeconds\`), 0) AS \`totalDurationSeconds\`
      FROM \`UserAnswer\` ua
      INNER JOIN \`Question\` q ON q.\`id\` = ua.\`questionId\`
      INNER JOIN \`Bank\` b ON b.\`id\` = q.\`bankId\`
      INNER JOIN \`Subject\` s ON s.\`id\` = b.\`subjectId\`
      WHERE ua.\`userId\` = ${userId}
        AND q.\`isActive\` = 1
        AND b.\`isActive\` = 1
        AND s.\`isActive\` = 1
        ${scopedSubjectSql}
    `),
    prisma.$queryRaw<LatestAnswerRow[]>(Prisma.sql`
      SELECT
        ranked.\`questionId\`,
        ranked.\`isCorrect\`,
        ranked.\`createdAt\`,
        ranked.\`bankId\`,
        ranked.\`subjectId\`
      FROM (
        SELECT
          ua.\`questionId\`,
          ua.\`isCorrect\`,
          ua.\`createdAt\`,
          q.\`bankId\`,
          b.\`subjectId\`,
          ROW_NUMBER() OVER (
            PARTITION BY ua.\`questionId\`
            ORDER BY ua.\`createdAt\` DESC, ua.\`id\` DESC
          ) AS \`rowNumber\`
        FROM \`UserAnswer\` ua
        INNER JOIN \`Question\` q ON q.\`id\` = ua.\`questionId\`
        INNER JOIN \`Bank\` b ON b.\`id\` = q.\`bankId\`
        INNER JOIN \`Subject\` s ON s.\`id\` = b.\`subjectId\`
        WHERE ua.\`userId\` = ${userId}
          AND q.\`isActive\` = 1
          AND b.\`isActive\` = 1
          AND s.\`isActive\` = 1
          ${scopedSubjectSql}
      ) ranked
      WHERE ranked.\`rowNumber\` = 1
    `),
    prisma.$queryRaw<DailyTrendAggregateRow[]>(Prisma.sql`
      SELECT
        bucketed.\`date\`,
        COUNT(bucketed.\`id\`) AS \`answerCount\`,
        SUM(CASE WHEN bucketed.\`isCorrect\` = 1 THEN 1 ELSE 0 END) AS \`correctCount\`
      FROM (
        SELECT
          ${trendBucketSql} AS \`date\`,
          ua.\`id\`,
          ua.\`isCorrect\`
        FROM \`UserAnswer\` ua
        INNER JOIN \`Question\` q ON q.\`id\` = ua.\`questionId\`
        INNER JOIN \`Bank\` b ON b.\`id\` = q.\`bankId\`
        INNER JOIN \`Subject\` s ON s.\`id\` = b.\`subjectId\`
        WHERE ua.\`userId\` = ${userId}
          AND ua.\`createdAt\` >= ${trendStart}
          AND ua.\`createdAt\` < ${tomorrow}
          AND q.\`isActive\` = 1
          AND b.\`isActive\` = 1
          AND s.\`isActive\` = 1
          ${scopedSubjectSql}
      ) bucketed
      WHERE bucketed.\`date\` IS NOT NULL
      GROUP BY bucketed.\`date\`
      ORDER BY bucketed.\`date\` ASC
    `),
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
                subject: { select: { name: true } }
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
  const latestAnswerRecords = latestAnswerRows.map((record) => ({
    questionId: record.questionId,
    isCorrect: toBoolean(record.isCorrect),
    createdAt: new Date(record.createdAt),
    bankId: record.bankId,
    subjectId: record.subjectId
  }));
  const scopedWrongRecords = wrongRecords.map((record) => ({
    questionId: record.questionId,
    subjectId: record.question.bank.subjectId
  }));
  const answerSummary = answerSummaryRows[0] || { answerRecordCount: 0, totalDurationSeconds: 0 };
  const summary = summarizeEffectiveAnswers(effectiveQuestions, latestAnswerRecords, scopedWrongRecords);
  const totalBySubject = new Map<string, number>();
  const favoriteBySubject = new Map<string, number>();

  for (const bank of banks) {
    totalBySubject.set(bank.subjectId, (totalBySubject.get(bank.subjectId) || 0) + effectiveQuestionCount(bank.questions));
  }
  for (const row of favoriteSubjectRows) {
    favoriteBySubject.set(row.subjectId, toNumber(row.favoriteCount));
  }

  const subjectStats = subjects.map((subject) => {
    const subjectQuestions = effectiveQuestions.filter((question) => question.subjectId === subject.id);
    const latestSummary = summarizeEffectiveAnswers(
      subjectQuestions,
      latestAnswerRecords.filter((record) => record.subjectId === subject.id),
      scopedWrongRecords.filter((record) => record.subjectId === subject.id)
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
    answerRecordCount: toNumber(answerSummary.answerRecordCount),
    correctCount: summary.correctCount,
    wrongCount: summary.wrongCount,
    accuracy: summary.accuracy,
    favoriteCount: Array.from(favoriteBySubject.values()).reduce((sum, value) => sum + value, 0),
    wrongQuestionCount: summary.wrongQuestionCount,
    totalQuestionCount: banks.reduce((sum, bank) => sum + effectiveQuestionCount(bank.questions), 0),
    subjectCount: subjects.length,
    bankCount: banks.length,
    totalDurationSeconds: toNumber(answerSummary.totalDurationSeconds),
    dailyTrend: buildDailyTrend(trendRows, trendStart, 7),
    subjectStats,
    weakSubjects,
    subjectOverview,
    recentBank
  };
}

async function loadPracticeReviewSummary(userId: string, scope: PracticeReviewSummaryScope = {}): Promise<PracticeReviewSummary> {
  const questionFilter = buildReviewQuestionFilter(scope);
  const queueStatuses = ['pending', 'processing', 'retrying'];
  const [wrongQuestionCount, favoriteCount, queuedAnswerCount] = await Promise.all([
    prisma.wrongQuestion.count({ where: { userId, question: questionFilter } }),
    prisma.userFavorite.count({ where: { userId, question: questionFilter } }),
    prisma.practiceAnswerQueueItem.count({
      where: {
        userId,
        status: { in: queueStatuses },
        question: questionFilter
      }
    })
  ]);

  return {
    wrongQuestionCount,
    favoriteCount,
    pendingAnswerCount: queuedAnswerCount,
    queuedAnswerCount,
    syncing: queuedAnswerCount > 0
  };
}

export async function getPracticeReviewSummary(userId: string, scope: PracticeReviewSummaryScope = {}) {
  const ttlMs = env.practiceReviewSummaryCacheSeconds * 1000;
  if (ttlMs <= 0) return loadPracticeReviewSummary(userId, scope);

  const key = reviewSummaryCacheKey(userId, scope);
  const now = Date.now();
  const cached = reviewSummaryCache.get(key);
  if (cached?.value && cached.expiresAt > now) return cached.value;
  if (cached?.promise) return cached.promise;

  const promise = loadPracticeReviewSummary(userId, scope)
    .then((value) => {
      reviewSummaryCache.set(key, { expiresAt: Date.now() + ttlMs, value });
      return value;
    })
    .catch((error) => {
      reviewSummaryCache.delete(key);
      throw error;
    });

  reviewSummaryCache.set(key, { expiresAt: now + ttlMs, promise });
  return promise;
}
