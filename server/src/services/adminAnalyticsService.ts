import { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { addDays, dayKey, dayLabel, dayStart } from '../utils/date.js';
import { UserRole } from '../utils/roles.js';

const ONLINE_WINDOW_MS = 5 * 60 * 1000;

type DailyActivityRow = {
  userId: string;
  createdAt: Date;
  isCorrect: boolean;
};

type ActiveUserRow = {
  id: string;
  nickname: string;
  email: string | null;
  answerCount: bigint | number;
  correctCount: bigint | number;
  durationSeconds: bigint | number | null;
};

function toNumber(value: bigint | number | null | undefined) {
  return Number(value || 0);
}

function studentAnswerWhere(createdAt: { gte: Date; lt: Date }) {
  return {
    createdAt,
    user: { role: UserRole.STUDENT, isActive: true }
  };
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

export async function getAdminActivityStats(trendDays = 14) {
  const days = Math.min(Math.max(Math.round(trendDays), 7), 30);
  const now = new Date();
  const today = dayStart(now);
  const tomorrow = addDays(today, 1);
  const sevenDayStart = addDays(today, -6);
  const trendStart = addDays(today, -(days - 1));
  const onlineSince = new Date(now.getTime() - ONLINE_WINDOW_MS);

  const [
    totalStudents,
    onlineUsers,
    activeTodayRows,
    activeSevenDayRows,
    answersToday,
    answersSevenDays,
    correctSevenDays,
    durationSevenDays,
    trendAnswers,
    activeUserRows
  ] = await Promise.all([
    prisma.user.count({ where: { role: UserRole.STUDENT, isActive: true } }),
    prisma.user.findMany({
      where: { role: UserRole.STUDENT, isActive: true, lastActiveAt: { gte: onlineSince } },
      orderBy: { lastActiveAt: 'desc' },
      take: 50,
      select: { id: true, nickname: true, email: true, lastActiveAt: true }
    }),
    prisma.userAnswer.groupBy({
      by: ['userId'],
      where: studentAnswerWhere({ gte: today, lt: tomorrow })
    }),
    prisma.userAnswer.groupBy({
      by: ['userId'],
      where: studentAnswerWhere({ gte: sevenDayStart, lt: tomorrow })
    }),
    prisma.userAnswer.count({ where: studentAnswerWhere({ gte: today, lt: tomorrow }) }),
    prisma.userAnswer.count({ where: studentAnswerWhere({ gte: sevenDayStart, lt: tomorrow }) }),
    prisma.userAnswer.count({ where: { ...studentAnswerWhere({ gte: sevenDayStart, lt: tomorrow }), isCorrect: true } }),
    prisma.userAnswer.aggregate({
      where: studentAnswerWhere({ gte: sevenDayStart, lt: tomorrow }),
      _sum: { durationSeconds: true }
    }),
    prisma.userAnswer.findMany({
      where: studentAnswerWhere({ gte: trendStart, lt: tomorrow }),
      select: { userId: true, createdAt: true, isCorrect: true }
    }),
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

  const trend = buildDailyActivityTrend(trendAnswers, trendStart, days);

  return {
    onlineWindowMinutes: ONLINE_WINDOW_MS / 60_000,
    checkedAt: now,
    summary: {
      totalStudents,
      onlineCount: onlineUsers.length,
      activeToday: activeTodayRows.length,
      activeSevenDays: activeSevenDayRows.length,
      answersToday,
      answersSevenDays,
      accuracySevenDays: answersSevenDays ? Math.round((correctSevenDays / answersSevenDays) * 100) : 0,
      durationSevenDays: durationSevenDays._sum.durationSeconds || 0
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
