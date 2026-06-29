import { prisma } from '../db/prisma.js';

export type AdminDashboardStats = {
  userCount: number;
  subjectCount: number;
  bankCount: number;
  questionCount: number;
  answerCount: number;
  questionTypeCounts: Array<{ type: string; label: string; count: number }>;
};

const DASHBOARD_CACHE_TTL_MS = 30_000;

const typeLabels: Record<string, string> = {
  single: '单选题',
  multiple: '多选题',
  judge: '判断题',
  fill: '填空题',
  python: 'Python题',
  reading: '阅读理解'
};

let cachedDashboardStats: { expiresAt: number; data: AdminDashboardStats } | null = null;
let loadingDashboardStats: Promise<AdminDashboardStats> | null = null;

async function loadAdminDashboardStats() {
  const [userCount, subjectCount, bankCount, questionCount, answerCount, questionTypeRows] = await Promise.all([
    prisma.user.count(),
    prisma.subject.count(),
    prisma.bank.count(),
    prisma.question.count(),
    prisma.userAnswer.count(),
    prisma.question.groupBy({
      by: ['type'],
      _count: { _all: true },
      orderBy: { type: 'asc' }
    })
  ]);

  return {
    userCount,
    subjectCount,
    bankCount,
    questionCount,
    answerCount,
    questionTypeCounts: questionTypeRows.map((row) => ({
      type: row.type,
      label: typeLabels[row.type] || row.type || '其他题型',
      count: row._count._all
    }))
  };
}

export async function getAdminDashboardStats(options: { force?: boolean } = {}) {
  const now = Date.now();
  if (!options.force && cachedDashboardStats && cachedDashboardStats.expiresAt > now) {
    return cachedDashboardStats.data;
  }
  if (!options.force && loadingDashboardStats) return loadingDashboardStats;

  loadingDashboardStats = loadAdminDashboardStats()
    .then((data) => {
      cachedDashboardStats = { data, expiresAt: Date.now() + DASHBOARD_CACHE_TTL_MS };
      return data;
    })
    .finally(() => {
      loadingDashboardStats = null;
    });

  return loadingDashboardStats;
}

export function invalidateAdminDashboardStatsCache() {
  cachedDashboardStats = null;
}
