import { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { addDays, dayKey, dayLabel, dayStart } from '../utils/date.js';
import { UserRole } from '../utils/roles.js';

const ONLINE_WINDOW_MS = 5 * 60 * 1000;

type DailyActivityRow = {
  dayKey: string;
  answerCount: bigint | number;
  activeUserCount: bigint | number;
  correctCount: bigint | number;
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

export async function getAdminActivityStats(trendDays = 14) {
  const days = Math.min(Math.max(Math.round(trendDays), 7), 30);
  const now = new Date();
  const today = dayStart(now);
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
    dailyRows,
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
      where: { createdAt: { gte: today } }
    }),
    prisma.userAnswer.groupBy({
      by: ['userId'],
      where: { createdAt: { gte: sevenDayStart } }
    }),
    prisma.userAnswer.count({ where: { createdAt: { gte: today } } }),
    prisma.userAnswer.count({ where: { createdAt: { gte: sevenDayStart } } }),
    prisma.userAnswer.count({ where: { createdAt: { gte: sevenDayStart }, isCorrect: true } }),
    prisma.userAnswer.aggregate({
      where: { createdAt: { gte: sevenDayStart } },
      _sum: { durationSeconds: true }
    }),
    prisma.$queryRaw<DailyActivityRow[]>(Prisma.sql`
      SELECT
        DATE_FORMAT(\`createdAt\`, '%Y-%m-%d') AS \`dayKey\`,
        COUNT(*) AS \`answerCount\`,
        COUNT(DISTINCT \`userId\`) AS \`activeUserCount\`,
        SUM(CASE WHEN \`isCorrect\` = 1 THEN 1 ELSE 0 END) AS \`correctCount\`
      FROM \`UserAnswer\`
      WHERE \`createdAt\` >= ${trendStart}
      GROUP BY DATE_FORMAT(\`createdAt\`, '%Y-%m-%d')
      ORDER BY \`dayKey\` ASC
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
        AND u.\`role\` = 'STUDENT'
      GROUP BY u.\`id\`, u.\`nickname\`, u.\`email\`
      ORDER BY \`answerCount\` DESC, \`correctCount\` DESC
      LIMIT 10
    `)
  ]);

  const rowMap = new Map(dailyRows.map((row) => [String(row.dayKey), row]));
  const trend = Array.from({ length: days }, (_, index) => {
    const date = addDays(trendStart, index);
    const key = dayKey(date);
    const row = rowMap.get(key);
    const answerCount = toNumber(row?.answerCount);
    const correctCount = toNumber(row?.correctCount);
    return {
      date: key,
      label: dayLabel(date),
      answerCount,
      activeUserCount: toNumber(row?.activeUserCount),
      correctCount,
      accuracy: answerCount ? Math.round((correctCount / answerCount) * 100) : 0
    };
  });

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
