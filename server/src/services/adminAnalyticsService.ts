import { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import {
  countOnlinePresenceUsers,
  listOnlinePresenceUsers,
  PRESENCE_ONLINE_WINDOW_SECONDS
} from './presenceService.js';
import { addDays, dayKey, dayLabel, dayStart } from '../utils/date.js';
import { buildDateBuckets, dateBucketCaseSql } from '../utils/sqlDateBuckets.js';
import { UserRole } from '../utils/roles.js';

type DailyActivityRow = {
  userId: string;
  createdAt: Date;
  isCorrect: boolean;
};

type DbNumeric = bigint | number | string | null | undefined;

type DailyActivityAggregateRow = {
  date: string;
  answerCount: DbNumeric;
  correctCount: DbNumeric;
  activeUserCount: DbNumeric;
};

type ActivitySummaryRow = {
  activeToday: DbNumeric;
  activeSevenDays: DbNumeric;
  answersToday: DbNumeric;
  answersSevenDays: DbNumeric;
  correctSevenDays: DbNumeric;
  durationSevenDays: DbNumeric;
};

type ActiveUserRow = {
  id: string;
  nickname: string;
  email: string | null;
  answerCount: DbNumeric;
  correctCount: DbNumeric;
  durationSeconds: DbNumeric;
};

function toNumber(value: DbNumeric) {
  if (value === null || value === undefined) return 0;
  const numberValue = typeof value === 'bigint' ? Number(value) : Number(value);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

export function buildDailyActivityTrend(records: DailyActivityRow[], trendStart: Date, days: number) {
  const trendMap = new Map<string, { answerCount: number; correctCount: number; activeUserIds: Set<string> }>();
  for (let index = 0; index < days; index += 1) {
    const date = addDays(trendStart, index);
    trendMap.set(dayKey(date), { answerCount: 0, correctCount: 0, activeUserIds: new Set() });
  }

  for (const answer of records) {
    const key = dayKey(answer.createdAt);
    const row = trendMap.get(key);
    if (!row) continue;
    row.answerCount += 1;
    if (answer.isCorrect) row.correctCount += 1;
    row.activeUserIds.add(answer.userId);
  }

  return Array.from({ length: days }, (_, index) => {
    const date = addDays(trendStart, index);
    const key = dayKey(date);
    const row = trendMap.get(key) || { answerCount: 0, correctCount: 0, activeUserIds: new Set<string>() };
    return {
      date: key,
      label: dayLabel(date),
      answerCount: row.answerCount,
      activeUserCount: row.activeUserIds.size,
      correctCount: row.correctCount,
      accuracy: row.answerCount ? Math.round((row.correctCount / row.answerCount) * 100) : 0
    };
  });
}

export function buildDailyActivityTrendFromAggregates(
  rows: DailyActivityAggregateRow[],
  trendStart: Date,
  days: number
) {
  const trendMap = new Map(rows.map((row) => [
    row.date,
    {
      answerCount: toNumber(row.answerCount),
      correctCount: toNumber(row.correctCount),
      activeUserCount: toNumber(row.activeUserCount)
    }
  ]));

  return Array.from({ length: days }, (_, index) => {
    const date = addDays(trendStart, index);
    const key = dayKey(date);
    const row = trendMap.get(key) || { answerCount: 0, correctCount: 0, activeUserCount: 0 };
    return {
      date: key,
      label: dayLabel(date),
      answerCount: row.answerCount,
      activeUserCount: row.activeUserCount,
      correctCount: row.correctCount,
      accuracy: row.answerCount ? Math.round((row.correctCount / row.answerCount) * 100) : 0
    };
  });
}

export async function getAdminActivityStats(trendDays = 14) {
  const days = Math.min(Math.max(Math.round(trendDays), 7), 30);
  const now = new Date();
  const today = dayStart(now);
  const tomorrow = addDays(today, 1);
  const sevenDayStart = addDays(today, -6);
  const trendStart = addDays(today, -(days - 1));
  const trendBucketSql = dateBucketCaseSql(Prisma.sql`a.\`createdAt\``, buildDateBuckets(trendStart, days));

  const [
    totalStudents,
    onlineCount,
    onlineUsers,
    activitySummaryRows,
    trendRows,
    activeUserRows
  ] = await Promise.all([
    prisma.user.count({ where: { role: UserRole.STUDENT, isActive: true } }),
    countOnlinePresenceUsers(now),
    listOnlinePresenceUsers(now),
    prisma.$queryRaw<ActivitySummaryRow[]>(Prisma.sql`
      SELECT
        COUNT(DISTINCT CASE WHEN a.\`createdAt\` >= ${today} THEN a.\`userId\` END) AS \`activeToday\`,
        COUNT(DISTINCT a.\`userId\`) AS \`activeSevenDays\`,
        SUM(CASE WHEN a.\`createdAt\` >= ${today} THEN 1 ELSE 0 END) AS \`answersToday\`,
        COUNT(a.\`id\`) AS \`answersSevenDays\`,
        SUM(CASE WHEN a.\`isCorrect\` = 1 THEN 1 ELSE 0 END) AS \`correctSevenDays\`,
        COALESCE(SUM(a.\`durationSeconds\`), 0) AS \`durationSevenDays\`
      FROM \`UserAnswer\` a
      INNER JOIN \`User\` u ON u.\`id\` = a.\`userId\`
      WHERE a.\`createdAt\` >= ${sevenDayStart}
        AND a.\`createdAt\` < ${tomorrow}
        AND u.\`role\` = 'STUDENT'
        AND u.\`isActive\` = 1
    `),
    prisma.$queryRaw<DailyActivityAggregateRow[]>(Prisma.sql`
      SELECT
        bucketed.\`date\`,
        COUNT(bucketed.\`id\`) AS \`answerCount\`,
        SUM(CASE WHEN bucketed.\`isCorrect\` = 1 THEN 1 ELSE 0 END) AS \`correctCount\`,
        COUNT(DISTINCT bucketed.\`userId\`) AS \`activeUserCount\`
      FROM (
        SELECT
          ${trendBucketSql} AS \`date\`,
          a.\`id\`,
          a.\`isCorrect\`,
          a.\`userId\`
        FROM \`UserAnswer\` a
        INNER JOIN \`User\` u ON u.\`id\` = a.\`userId\`
        WHERE a.\`createdAt\` >= ${trendStart}
          AND a.\`createdAt\` < ${tomorrow}
          AND u.\`role\` = 'STUDENT'
          AND u.\`isActive\` = 1
      ) bucketed
      WHERE bucketed.\`date\` IS NOT NULL
      GROUP BY bucketed.\`date\`
      ORDER BY bucketed.\`date\` ASC
    `),
    prisma.$queryRaw<ActiveUserRow[]>(Prisma.sql`
      SELECT
        u.\`id\`,
        u.\`nickname\`,
        u.\`email\`,
        COUNT(a.\`id\`) AS \`answerCount\`,
        SUM(CASE WHEN a.\`isCorrect\` = 1 THEN 1 ELSE 0 END) AS \`correctCount\`,
        SUM(a.\`durationSeconds\`) AS \`durationSeconds\`
      FROM \`UserAnswer\` a
      INNER JOIN \`User\` u ON u.\`id\` = a.\`userId\`
      WHERE a.\`createdAt\` >= ${sevenDayStart}
        AND a.\`createdAt\` < ${tomorrow}
        AND u.\`role\` = 'STUDENT'
        AND u.\`isActive\` = 1
      GROUP BY u.\`id\`, u.\`nickname\`, u.\`email\`
      ORDER BY \`answerCount\` DESC, \`correctCount\` DESC
      LIMIT 10
    `)
  ]);

  const activitySummary = activitySummaryRows[0] || {
    activeToday: 0,
    activeSevenDays: 0,
    answersToday: 0,
    answersSevenDays: 0,
    correctSevenDays: 0,
    durationSevenDays: 0
  };
  const answersSevenDays = toNumber(activitySummary.answersSevenDays);
  const correctSevenDays = toNumber(activitySummary.correctSevenDays);
  const trend = buildDailyActivityTrendFromAggregates(trendRows, trendStart, days);

  return {
    onlineWindowMinutes: PRESENCE_ONLINE_WINDOW_SECONDS / 60,
    onlineWindowSeconds: PRESENCE_ONLINE_WINDOW_SECONDS,
    checkedAt: now,
    summary: {
      totalStudents,
      onlineCount,
      activeToday: toNumber(activitySummary.activeToday),
      activeSevenDays: toNumber(activitySummary.activeSevenDays),
      answersToday: toNumber(activitySummary.answersToday),
      answersSevenDays,
      accuracySevenDays: answersSevenDays ? Math.round((correctSevenDays / answersSevenDays) * 100) : 0,
      durationSevenDays: toNumber(activitySummary.durationSevenDays)
    },
    onlineUsers,
    trend,
    topActiveUsers: activeUserRows.map((row) => {
      const answerCount = toNumber(row.answerCount);
      const correctCount = toNumber(row.correctCount);
      return {
        id: row.id,
        nickname: row.nickname,
        email: row.email,
        answerCount,
        correctCount,
        accuracy: answerCount ? Math.round((correctCount / answerCount) * 100) : 0,
        durationSeconds: toNumber(row.durationSeconds)
      };
    })
  };
}
