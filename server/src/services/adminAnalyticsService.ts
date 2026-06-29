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

type DailyUserActivityAggregateRow = {
  date: string;
  userId: string;
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

export function buildActivityStatsFromDailyUserAggregates(
  rows: DailyUserActivityAggregateRow[],
  trendStart: Date,
  days: number,
  sevenDayStart: Date,
  today: Date,
  topLimit = 10
) {
  const todayKey = dayKey(today);
  const sevenDayStartKey = dayKey(sevenDayStart);
  const trendMap = new Map<string, { answerCount: number; correctCount: number; activeUserCount: number }>();
  const activeTodayUserIds = new Set<string>();
  const activeSevenDayUserIds = new Set<string>();
  const topUserMap = new Map<string, {
    id: string;
    nickname: string;
    email: string | null;
    answerCount: number;
    correctCount: number;
    durationSeconds: number;
  }>();
  let answersToday = 0;
  let answersSevenDays = 0;
  let correctSevenDays = 0;
  let durationSevenDays = 0;

  for (let index = 0; index < days; index += 1) {
    trendMap.set(dayKey(addDays(trendStart, index)), { answerCount: 0, correctCount: 0, activeUserCount: 0 });
  }

  for (const row of rows) {
    const answerCount = toNumber(row.answerCount);
    const correctCount = toNumber(row.correctCount);
    const durationSeconds = toNumber(row.durationSeconds);
    const trendRow = trendMap.get(row.date);
    if (trendRow) {
      trendRow.answerCount += answerCount;
      trendRow.correctCount += correctCount;
      if (answerCount > 0) trendRow.activeUserCount += 1;
    }

    if (row.date < sevenDayStartKey) continue;
    activeSevenDayUserIds.add(row.userId);
    answersSevenDays += answerCount;
    correctSevenDays += correctCount;
    durationSevenDays += durationSeconds;

    const topUser = topUserMap.get(row.userId) || {
      id: row.userId,
      nickname: row.nickname,
      email: row.email,
      answerCount: 0,
      correctCount: 0,
      durationSeconds: 0
    };
    topUser.answerCount += answerCount;
    topUser.correctCount += correctCount;
    topUser.durationSeconds += durationSeconds;
    topUserMap.set(row.userId, topUser);

    if (row.date === todayKey) {
      activeTodayUserIds.add(row.userId);
      answersToday += answerCount;
    }
  }

  const trend = Array.from({ length: days }, (_, index) => {
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

  const topActiveUsers = Array.from(topUserMap.values())
    .sort((left, right) => (
      right.answerCount - left.answerCount
      || right.correctCount - left.correctCount
      || left.nickname.localeCompare(right.nickname, 'zh-Hans-CN')
      || left.id.localeCompare(right.id)
    ))
    .slice(0, topLimit)
    .map((row) => ({
      ...row,
      accuracy: row.answerCount ? Math.round((row.correctCount / row.answerCount) * 100) : 0
    }));

  return {
    summary: {
      activeToday: activeTodayUserIds.size,
      activeSevenDays: activeSevenDayUserIds.size,
      answersToday,
      answersSevenDays,
      correctSevenDays,
      durationSevenDays
    },
    trend,
    topActiveUsers
  };
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
    dailyUserRows
  ] = await Promise.all([
    prisma.user.count({ where: { role: UserRole.STUDENT, isActive: true } }),
    countOnlinePresenceUsers(now),
    listOnlinePresenceUsers(now),
    prisma.$queryRaw<DailyUserActivityAggregateRow[]>(Prisma.sql`
      SELECT
        bucketed.\`date\`,
        bucketed.\`userId\`,
        bucketed.\`nickname\`,
        bucketed.\`email\`,
        COUNT(bucketed.\`id\`) AS \`answerCount\`,
        SUM(CASE WHEN bucketed.\`isCorrect\` = 1 THEN 1 ELSE 0 END) AS \`correctCount\`,
        COALESCE(SUM(bucketed.\`durationSeconds\`), 0) AS \`durationSeconds\`
      FROM (
        SELECT
          ${trendBucketSql} AS \`date\`,
          a.\`id\`,
          a.\`isCorrect\`,
          a.\`userId\`,
          a.\`durationSeconds\`,
          u.\`nickname\`,
          u.\`email\`
        FROM \`UserAnswer\` a
        INNER JOIN \`User\` u ON u.\`id\` = a.\`userId\`
        WHERE a.\`createdAt\` >= ${trendStart}
          AND a.\`createdAt\` < ${tomorrow}
          AND u.\`role\` = 'STUDENT'
          AND u.\`isActive\` = 1
      ) bucketed
      WHERE bucketed.\`date\` IS NOT NULL
      GROUP BY bucketed.\`date\`, bucketed.\`userId\`, bucketed.\`nickname\`, bucketed.\`email\`
      ORDER BY bucketed.\`date\` ASC
    `)
  ]);

  const activity = buildActivityStatsFromDailyUserAggregates(dailyUserRows, trendStart, days, sevenDayStart, today);
  const answersSevenDays = activity.summary.answersSevenDays;
  const correctSevenDays = activity.summary.correctSevenDays;

  return {
    onlineWindowMinutes: PRESENCE_ONLINE_WINDOW_SECONDS / 60,
    onlineWindowSeconds: PRESENCE_ONLINE_WINDOW_SECONDS,
    checkedAt: now,
    summary: {
      totalStudents,
      onlineCount,
      activeToday: activity.summary.activeToday,
      activeSevenDays: activity.summary.activeSevenDays,
      answersToday: activity.summary.answersToday,
      answersSevenDays,
      accuracySevenDays: answersSevenDays ? Math.round((correctSevenDays / answersSevenDays) * 100) : 0,
      durationSevenDays: activity.summary.durationSevenDays
    },
    onlineUsers,
    trend: activity.trend,
    topActiveUsers: activity.topActiveUsers
  };
}
