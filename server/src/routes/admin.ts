import { Router, type Request } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { UserRole, type UserRole as UserRoleType } from '../utils/roles.js';
import { prisma } from '../db/prisma.js';
import { adminRequired, authRequired } from '../middleware/auth.js';
import { importLegacyBankJson } from '../services/importService.js';
import { fail, ok, pageMeta, toInt, HttpError } from '../utils/http.js';
import { validatePasswordStrength } from '../utils/passwordPolicy.js';
import { normalizeJudgeAnswerArray, normalizeJudgeOptionsForStorage } from '../utils/judge.js';
import { normalizeAnswerForObjectiveType } from '../utils/answerNormalization.js';
import { createToken } from '../services/authService.js';
import { setAuthCookies } from '../utils/cookie.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { adminAuditMiddleware, getAdminActionOptions } from '../services/adminAuditService.js';
import {
  getAdminActivityDetail,
  getAdminActivityStats,
  getAdminActivitySummary
} from '../services/adminAnalyticsService.js';
import { getAdminDashboardStats } from '../services/adminDashboardService.js';
import { getAdminReadingPassage, saveAdminReadingPassage } from '../services/adminReadingPassageService.js';
import { getPracticeAnswerQueueMonitor } from '../services/practiceAnswerQueueService.js';
import { getSystemControls, serializeSystemControls, updateSystemControls } from '../services/systemControlService.js';
import { env } from '../config/env.js';
import { assertAllowedNickname, hasForbiddenNickname, NICKNAME_MAX_CHARS } from '../utils/nicknamePolicy.js';
import {
  createAnnouncement,
  deleteAnnouncement,
  listAdminAnnouncements,
  updateAnnouncement
} from '../services/announcementService.js';

const router = Router();
router.use(authRequired, adminRequired);
router.use(adminAuditMiddleware);

let systemHealthCache: { expiresAt: number; value: unknown } | null = null;

function parseOptionalDate(value: unknown) {
  const text = String(value || '').trim();
  if (!text) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

function recentActiveWhere(value: string): Prisma.UserWhereInput {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const daysAgo = (days: number) => {
    const date = new Date(today);
    date.setDate(date.getDate() - days);
    return date;
  };

  if (value === 'today') return { lastActiveAt: { gte: today } };
  if (value === '7d') return { lastActiveAt: { gte: daysAgo(6) } };
  if (value === '30d') return { lastActiveAt: { gte: daysAgo(29) } };
  if (value === 'inactive30') return { OR: [{ lastActiveAt: null }, { lastActiveAt: { lt: daysAgo(29) } }] };
  if (value === 'never') return { lastActiveAt: null };
  return {};
}

function userBaseWhere(req: Request) {
  const keyword = String(req.query.keyword || '').trim();
  const status = String(req.query.status || '').trim();
  const recentActive = String(req.query.recentActive || '').trim();
  const registeredStartAt = parseOptionalDate(req.query.registeredStartAt);
  const registeredEndAt = parseOptionalDate(req.query.registeredEndAt);
  const createdAt: Prisma.DateTimeFilter = {};
  if (registeredStartAt) createdAt.gte = registeredStartAt;
  if (registeredEndAt) createdAt.lte = registeredEndAt;

  return {
    role: UserRole.STUDENT,
    ...(status === 'active' ? { isActive: true } : {}),
    ...(status === 'inactive' ? { isActive: false } : {}),
    ...recentActiveWhere(recentActive),
    ...(Object.keys(createdAt).length ? { createdAt } : {}),
    ...(keyword ? { OR: [{ email: { contains: keyword } }, { nickname: { contains: keyword } }] } : {})
  } satisfies Prisma.UserWhereInput;
}

async function userWhereWithNicknameStatus(baseWhere: Prisma.UserWhereInput, nicknameStatus: string) {
  if (nicknameStatus !== 'normal' && nicknameStatus !== 'violation') return baseWhere;
  const candidates = await prisma.user.findMany({
    where: baseWhere,
    select: { id: true, nickname: true }
  });
  const ids = candidates
    .filter((item) => hasForbiddenNickname(item.nickname) === (nicknameStatus === 'violation'))
    .map((item) => item.id);
  return { ...baseWhere, id: { in: ids.length ? ids : ['__none__'] } } satisfies Prisma.UserWhereInput;
}

function percentage(correctCount: number, answerCount: number) {
  return answerCount ? Math.round((correctCount / answerCount) * 100) : 0;
}

router.get('/dashboard', asyncHandler(async (_req, res) => {
  return ok(res, await getAdminDashboardStats());
}));

router.get('/activity', asyncHandler(async (req, res) => {
  const days = Math.min(Math.max(toInt(req.query.days, 14), 7), 30);
  return ok(res, await getAdminActivityStats(days));
}));

router.get('/activity/summary', asyncHandler(async (req, res) => {
  const days = Math.min(Math.max(toInt(req.query.days, 14), 7), 30);
  return ok(res, await getAdminActivitySummary(days));
}));

router.get('/activity/detail', asyncHandler(async (req, res) => {
  const days = Math.min(Math.max(toInt(req.query.days, 14), 7), 30);
  return ok(res, await getAdminActivityDetail(days));
}));

router.get('/announcements', asyncHandler(async (req, res) => {
  return ok(res, await listAdminAnnouncements(req.query as Record<string, unknown>));
}));

router.post('/announcements', asyncHandler(async (req, res) => {
  return ok(res, await createAnnouncement(req.body), '公告已创建');
}));

router.put('/announcements/:id', asyncHandler(async (req, res) => {
  return ok(res, await updateAnnouncement(req.params.id, req.body), '公告已保存');
}));

router.delete('/announcements/:id', asyncHandler(async (req, res) => {
  return ok(res, await deleteAnnouncement(req.params.id), '公告已删除');
}));

router.get('/audit-logs', asyncHandler(async (req, res) => {
  const page = toInt(req.query.page, 1);
  const pageSize = Math.min(toInt(req.query.pageSize, 20), 100);
  const keyword = String(req.query.keyword || '').trim();
  const action = String(req.query.action || '').trim();
  const startAt = String(req.query.startAt || '').trim();
  const endAt = String(req.query.endAt || '').trim();
  const createdAt: { gte?: Date; lte?: Date } = {};
  const parsedStart = startAt ? new Date(startAt) : null;
  const parsedEnd = endAt ? new Date(endAt) : null;
  if (parsedStart && !Number.isNaN(parsedStart.getTime())) createdAt.gte = parsedStart;
  if (parsedEnd && !Number.isNaN(parsedEnd.getTime())) createdAt.lte = parsedEnd;

  const where = {
    ...(action ? { action } : {}),
    ...(Object.keys(createdAt).length ? { createdAt } : {}),
    ...(keyword ? {
      OR: [
        { summary: { contains: keyword } },
        { path: { contains: keyword } },
        { targetId: { contains: keyword } },
        { admin: { username: { contains: keyword } } },
        { admin: { nickname: { contains: keyword } } }
      ]
    } : {})
  };

  const [total, rows] = await Promise.all([
    prisma.adminOperationLog.count({ where }),
    prisma.adminOperationLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        action: true,
        summary: true,
        method: true,
        path: true,
        targetType: true,
        targetId: true,
        ipAddress: true,
        statusCode: true,
        durationMs: true,
        createdAt: true,
        admin: { select: { id: true, username: true, nickname: true } }
      }
    })
  ]);

  return ok(res, {
    rows,
    actionOptions: getAdminActionOptions(),
    meta: pageMeta(page, pageSize, total)
  });
}));

router.get('/users', asyncHandler(async (req, res) => {
  const page = toInt(req.query.page, 1);
  const pageSize = Math.min(toInt(req.query.pageSize, 20), 100);
  const nicknameStatus = String(req.query.nicknameStatus || '').trim();
  const baseWhere = userBaseWhere(req);
  const where = await userWhereWithNicknameStatus(baseWhere, nicknameStatus);

  const [summaryRows, rows] = await Promise.all([
    prisma.user.findMany({
      where,
      select: { id: true, nickname: true, isActive: true, lastActiveAt: true }
    }),
    prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        email: true,
        nickname: true,
        role: true,
        isActive: true,
        createdAt: true,
        lastActiveAt: true
      }
    })
  ]);

  const userIds = rows.map((row) => row.id);
  const [answerStats, correctStats, wrongStats, favoriteStats] = userIds.length ? await Promise.all([
    prisma.userAnswer.groupBy({
      by: ['userId'],
      where: { userId: { in: userIds } },
      _count: { _all: true },
      _sum: { durationSeconds: true },
      _max: { createdAt: true }
    }),
    prisma.userAnswer.groupBy({
      by: ['userId'],
      where: { userId: { in: userIds }, isCorrect: true },
      _count: { _all: true }
    }),
    prisma.wrongQuestion.groupBy({
      by: ['userId'],
      where: { userId: { in: userIds } },
      _count: { _all: true }
    }),
    prisma.userFavorite.groupBy({
      by: ['userId'],
      where: { userId: { in: userIds } },
      _count: { _all: true }
    })
  ]) : [[], [], [], []];

  const answerByUser = new Map(answerStats.map((item) => [item.userId, item]));
  const correctByUser = new Map(correctStats.map((item) => [item.userId, item._count._all]));
  const wrongByUser = new Map(wrongStats.map((item) => [item.userId, item._count._all]));
  const favoriteByUser = new Map(favoriteStats.map((item) => [item.userId, item._count._all]));
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
  const thirtyDaysAgo = new Date(today);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29);

  return ok(res, {
    summary: {
      total: summaryRows.length,
      activeCount: summaryRows.filter((row) => row.isActive).length,
      inactiveCount: summaryRows.filter((row) => !row.isActive).length,
      nicknameViolationCount: summaryRows.filter((row) => hasForbiddenNickname(row.nickname)).length,
      activeToday: summaryRows.filter((row) => row.lastActiveAt && row.lastActiveAt >= today).length,
      activeSevenDays: summaryRows.filter((row) => row.lastActiveAt && row.lastActiveAt >= sevenDaysAgo).length,
      inactiveThirtyDays: summaryRows.filter((row) => !row.lastActiveAt || row.lastActiveAt < thirtyDaysAgo).length
    },
    rows: rows.map((row) => {
      const answers = answerByUser.get(row.id);
      const answerCount = answers?._count._all || 0;
      const correctCount = correctByUser.get(row.id) || 0;
      return {
        ...row,
        nicknameViolation: hasForbiddenNickname(row.nickname),
        answerCount,
        correctCount,
        accuracy: percentage(correctCount, answerCount),
        wrongCount: wrongByUser.get(row.id) || 0,
        favoriteCount: favoriteByUser.get(row.id) || 0,
        durationSeconds: answers?._sum.durationSeconds || 0,
        lastAnsweredAt: answers?._max.createdAt || null
      };
    }),
    meta: pageMeta(page, pageSize, summaryRows.length)
  });
}));

router.get('/users/:id', asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.params.id },
    select: {
      id: true,
      email: true,
      nickname: true,
      role: true,
      isActive: true,
      createdAt: true,
      lastActiveAt: true
    }
  });
  if (!user || user.role !== UserRole.STUDENT) return fail(res, '答题用户不存在', 404);

  const [answerCount, correctCount, duration, lastAnswer, wrongCount, favoriteCount, recentAnswers] = await Promise.all([
    prisma.userAnswer.count({ where: { userId: user.id } }),
    prisma.userAnswer.count({ where: { userId: user.id, isCorrect: true } }),
    prisma.userAnswer.aggregate({ where: { userId: user.id }, _sum: { durationSeconds: true } }),
    prisma.userAnswer.findFirst({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
    prisma.wrongQuestion.count({ where: { userId: user.id } }),
    prisma.userFavorite.count({ where: { userId: user.id } }),
    prisma.userAnswer.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true,
        questionId: true,
        selectedJson: true,
        isCorrect: true,
        durationSeconds: true,
        createdAt: true,
        question: {
          select: {
            type: true,
            typeLabel: true,
            stem: true,
            bank: {
              select: {
                name: true,
                subject: { select: { name: true } }
              }
            }
          }
        }
      }
    })
  ]);

  return ok(res, {
    user: { ...user, nicknameViolation: hasForbiddenNickname(user.nickname) },
    stats: {
      answerCount,
      correctCount,
      accuracy: percentage(correctCount, answerCount),
      wrongCount,
      favoriteCount,
      durationSeconds: duration._sum.durationSeconds || 0,
      lastAnsweredAt: lastAnswer?.createdAt || null
    },
    recentAnswers: recentAnswers.map((answer) => ({
      id: answer.id,
      questionId: answer.questionId,
      selected: answer.selectedJson,
      isCorrect: answer.isCorrect,
      durationSeconds: answer.durationSeconds,
      createdAt: answer.createdAt,
      questionType: answer.question.type,
      questionTypeLabel: answer.question.typeLabel,
      questionStem: answer.question.stem,
      bankName: answer.question.bank.name,
      subjectName: answer.question.bank.subject.name
    }))
  });
}));

router.patch('/users/batch', asyncHandler(async (req, res) => {
  const schema = z.object({
    ids: z.array(z.string().trim().min(1)).min(1, '请选择用户').max(100, '单次最多处理 100 个用户'),
    action: z.enum(['enable', 'disable', 'resetNickname'])
  });
  const input = schema.parse(req.body);
  const ids = Array.from(new Set(input.ids));
  const targets = await prisma.user.findMany({
    where: { id: { in: ids }, role: UserRole.STUDENT },
    select: { id: true }
  });
  if (targets.length !== ids.length) return fail(res, '只能批量处理答题端用户', 400);

  if (input.action === 'enable' || input.action === 'disable') {
    await prisma.user.updateMany({
      where: { id: { in: ids }, role: UserRole.STUDENT },
      data: { isActive: input.action === 'enable' }
    });
    return ok(res, { count: ids.length });
  }

  await prisma.$transaction(ids.map((id) => (
    prisma.user.update({
      where: { id },
      data: { nickname: assertAllowedNickname(`用户${id.slice(-6)}`, { emptyMessage: '昵称不能为空' }) }
    })
  )));
  return ok(res, { count: ids.length });
}));

router.patch('/users/:id', asyncHandler(async (req, res) => {
  const schema = z.object({
    isActive: z.boolean().optional(),
    nickname: z.string().max(NICKNAME_MAX_CHARS, `昵称不能超过 ${NICKNAME_MAX_CHARS} 个字符`).optional()
  });
  const input = schema.parse(req.body);
  const data: { isActive?: boolean; nickname?: string } = {};
  if (typeof input.isActive === 'boolean') data.isActive = input.isActive;
  if (typeof input.nickname !== 'undefined') {
    data.nickname = assertAllowedNickname(input.nickname, { emptyMessage: '昵称不能为空' });
  }
  const target = await prisma.user.findUnique({ where: { id: req.params.id }, select: { id: true, role: true } });
  if (!target || target.role !== UserRole.STUDENT) return fail(res, '只能修改答题端用户', 400);
  const user = await prisma.user.update({
    where: { id: req.params.id },
    data,
    select: { id: true, email: true, nickname: true, role: true, isActive: true, createdAt: true, lastActiveAt: true }
  });
  return ok(res, { ...user, nicknameViolation: hasForbiddenNickname(user.nickname) });
}));

router.get('/admins', asyncHandler(async (req, res) => {
  const page = toInt(req.query.page, 1);
  const pageSize = Math.min(toInt(req.query.pageSize, 20), 100);
  const keyword = String(req.query.keyword || '').trim();
  const where = {
    role: UserRole.ADMIN,
    ...(keyword ? { OR: [{ username: { contains: keyword } }, { email: { contains: keyword } }, { nickname: { contains: keyword } }] } : {})
  };
  const [total, rows] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: { id: true, username: true, email: true, nickname: true, role: true, isActive: true, createdAt: true }
    })
  ]);
  return ok(res, {
    rows: rows.map((row) => ({ ...row, nicknameViolation: hasForbiddenNickname(row.nickname) })),
    meta: pageMeta(page, pageSize, total)
  });
}));

router.patch('/admins/:id', asyncHandler(async (req, res) => {
  const schema = z.object({
    isActive: z.boolean().optional(),
    nickname: z.string().max(NICKNAME_MAX_CHARS, `昵称不能超过 ${NICKNAME_MAX_CHARS} 个字符`).optional()
  });
  const input = schema.parse(req.body);
  const data: { isActive?: boolean; nickname?: string } = {};
  if (typeof input.isActive === 'boolean') data.isActive = input.isActive;
  if (typeof input.nickname !== 'undefined') {
    data.nickname = assertAllowedNickname(input.nickname, { emptyMessage: '昵称不能为空' });
  }
  const target = await prisma.user.findUnique({ where: { id: req.params.id }, select: { id: true, role: true } });
  if (!target || target.role !== UserRole.ADMIN) return fail(res, '只能修改管理员账号', 400);
  if (req.auth?.userId === req.params.id && input.isActive === false) return fail(res, '不能停用当前登录管理员', 400);
  const user = await prisma.user.update({
    where: { id: req.params.id },
    data,
    select: { id: true, username: true, email: true, nickname: true, role: true, isActive: true }
  });
  return ok(res, { ...user, nicknameViolation: hasForbiddenNickname(user.nickname) });
}));

router.put('/password', asyncHandler(async (req, res) => {
  try {
    const schema = z.object({
      oldPassword: z.string().min(1, '请输入当前密码'),
      newPassword: z.string().min(8, '新密码至少 8 位').max(100)
    });
    const input = schema.parse(req.body);
    const issue = validatePasswordStrength(input.newPassword);
    if (issue) throw new HttpError(issue, 400);

    const admin = await prisma.user.findUnique({ where: { id: req.auth!.userId } });
    if (!admin || admin.role !== UserRole.ADMIN) return fail(res, '管理员不存在', 404);

    const matched = await bcrypt.compare(input.oldPassword, admin.passwordHash);
    if (!matched) return fail(res, '当前密码错误', 400);
    if (await bcrypt.compare(input.newPassword, admin.passwordHash)) return fail(res, '新密码不能与旧密码相同', 400);

    const passwordHash = await bcrypt.hash(input.newPassword, 12);
    const updated = await prisma.user.update({
      where: { id: admin.id },
      data: { passwordHash, sessionVersion: { increment: 1 } }
    });
    const session = await createToken(updated, 'admin');
    setAuthCookies(res, session.token, session.csrfToken, 'admin');
    return ok(res, { changed: true }, '管理员密码已修改');
  } catch (error) {
    if (error instanceof HttpError) return fail(res, error.message, error.status, error.code);
    return fail(res, error instanceof Error ? error.message : '密码修改失败', 400);
  }
}));



async function getNextBankSortOrder(subjectId: string) {
  const result = await prisma.bank.aggregate({
    where: { subjectId },
    _max: { sortOrder: true }
  });
  return (result._max.sortOrder ?? -1) + 1;
}

async function getNextSubjectSortOrder() {
  const result = await prisma.subject.aggregate({
    _max: { sortOrder: true }
  });
  return (result._max.sortOrder ?? -1) + 1;
}

const bankDisplayOrder = [{ sortOrder: 'asc' as const }, { createdAt: 'asc' as const }, { id: 'asc' as const }];

router.get('/tree', asyncHandler(async (_req, res) => {
  const subjects = await prisma.subject.findMany({
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    include: {
      banks: {
        orderBy: bankDisplayOrder,
        include: { _count: { select: { questions: true } } }
      },
      _count: { select: { banks: true } }
    }
  });

  const rows = subjects.map((subject) => ({
    id: subject.id,
    legacyId: subject.legacyId,
    name: subject.name,
    description: subject.description,
    color: subject.color,
    sortOrder: subject.sortOrder,
    isActive: subject.isActive,
    createdAt: subject.createdAt,
    updatedAt: subject.updatedAt,
    bankCount: subject._count.banks,
    banks: subject.banks.map((bank) => ({
      id: bank.id,
      legacyId: bank.legacyId,
      subjectId: bank.subjectId,
      name: bank.name,
      description: bank.description,
      sourceFile: bank.sourceFile,
      sortOrder: bank.sortOrder,
      isActive: bank.isActive,
      questionCount: bank._count.questions,
      createdAt: bank.createdAt,
      updatedAt: bank.updatedAt
    }))
  }));

  return ok(res, rows);
}));

router.get('/system/status', asyncHandler(async (_req, res) => {
  await prisma.$queryRaw`SELECT 1`;
  const dashboardStats = await getAdminDashboardStats();
  return ok(res, {
    api: 'ok',
    database: 'ok',
    subjectCount: dashboardStats.subjectCount,
    bankCount: dashboardStats.bankCount,
    questionCount: dashboardStats.questionCount,
    userCount: dashboardStats.userCount,
    answerCount: dashboardStats.answerCount,
    checkedAt: new Date().toISOString()
  });
}));

router.get('/system/controls', asyncHandler(async (_req, res) => {
  return ok(res, serializeSystemControls(await getSystemControls()));
}));

router.put('/system/controls', asyncHandler(async (req, res) => {
  const schema = z.object({
    userLoginDisabled: z.boolean().optional(),
    practiceAnswerWorkerPaused: z.boolean().optional()
  });
  const input = schema.parse(req.body);
  const controls = await updateSystemControls(input);
  systemHealthCache = null;
  return ok(res, serializeSystemControls(controls), '系统控制已更新');
}));

router.get('/system/practice-answer-queue', asyncHandler(async (_req, res) => {
  return ok(res, await getPracticeAnswerQueueMonitor());
}));

router.get('/system/health', asyncHandler(async (_req, res) => {
  if (systemHealthCache && systemHealthCache.expiresAt > Date.now()) return ok(res, systemHealthCache.value);

  const databaseStartedAt = Date.now();
  await prisma.$queryRaw`SELECT 1`;
  const databaseLatencyMs = Date.now() - databaseStartedAt;
  const [controls, queue] = await Promise.all([
    getSystemControls(),
    getPracticeAnswerQueueMonitor()
  ]);

  const value = {
    api: 'ok',
    database: {
      status: 'ok',
      latencyMs: databaseLatencyMs
    },
    controls: serializeSystemControls(controls),
    queue,
    worker: queue.worker,
    version: {
      server: process.env.QANDA_BUILD_ID || process.env.npm_package_version || '2.0.0'
    },
    checkedAt: new Date().toISOString()
  };
  if (env.systemHealthCacheMs > 0) {
    systemHealthCache = { value, expiresAt: Date.now() + env.systemHealthCacheMs };
  }
  return ok(res, value);
}));

router.get('/subjects', asyncHandler(async (_req, res) => {
  const rows = await prisma.subject.findMany({ orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }], include: { _count: { select: { banks: true } } } });
  return ok(res, rows.map((item) => ({ ...item, bankCount: item._count.banks })));
}));

router.post('/subjects', asyncHandler(async (req, res) => {
  const schema = z.object({ name: z.string().min(1), description: z.string().optional(), color: z.string().optional(), sortOrder: z.number().optional() });
  const input = schema.parse(req.body);
  const sortOrder = input.sortOrder ?? await getNextSubjectSortOrder();
  const subject = await prisma.subject.create({ data: { ...input, sortOrder } });
  return ok(res, subject, '创建成功');
}));

router.put('/subjects/sort-order', asyncHandler(async (req, res) => {
  const schema = z.object({
    ids: z.array(z.string().trim().min(1)).min(1, '科目排序不能为空')
  });
  const { ids } = schema.parse(req.body);
  if (new Set(ids).size !== ids.length) throw new HttpError('科目排序包含重复项', 400);

  const subjects = await prisma.subject.findMany({ select: { id: true } });
  const existingIds = new Set(subjects.map((subject) => subject.id));
  if (ids.length !== subjects.length || ids.some((id) => !existingIds.has(id))) {
    throw new HttpError('科目排序数据与当前科目不一致，请刷新后重试', 400);
  }

  await prisma.$transaction(ids.map((id, index) => prisma.subject.update({
    where: { id },
    data: { sortOrder: index }
  })));
  return ok(res, true, '排序已保存');
}));

router.put('/subjects/:id', asyncHandler(async (req, res) => {
  const schema = z.object({ name: z.string().min(1), description: z.string().optional(), color: z.string().optional(), sortOrder: z.number().optional(), isActive: z.boolean().optional() });
  const input = schema.parse(req.body);
  const subject = await prisma.subject.update({ where: { id: req.params.id }, data: input });
  return ok(res, subject, '保存成功');
}));

router.delete('/subjects/:id', asyncHandler(async (req, res) => {
  await prisma.subject.delete({ where: { id: req.params.id } });
  return ok(res, true, '删除成功');
}));

router.get('/banks', asyncHandler(async (req, res) => {
  const subjectId = String(req.query.subjectId || '').trim();
  const rows = await prisma.bank.findMany({
    where: subjectId ? { subjectId } : {},
    orderBy: bankDisplayOrder,
    include: { subject: true, _count: { select: { questions: true } } }
  });
  return ok(res, rows.map((bank) => ({ ...bank, subjectName: bank.subject.name, questionCount: bank._count.questions })));
}));

router.post('/banks', asyncHandler(async (req, res) => {
  const schema = z.object({ subjectId: z.string(), name: z.string().min(1), description: z.string().optional(), sortOrder: z.number().optional(), isActive: z.boolean().optional() });
  const input = schema.parse(req.body);
  const sortOrder = input.sortOrder ?? await getNextBankSortOrder(input.subjectId);
  const bank = await prisma.bank.create({ data: { ...input, sortOrder } });
  return ok(res, bank, '创建成功');
}));

router.put('/banks/sort-order', asyncHandler(async (req, res) => {
  const schema = z.object({
    subjectId: z.string().trim().min(1, '请选择科目'),
    ids: z.array(z.string().trim().min(1)).min(1, '单元排序不能为空')
  });
  const { subjectId, ids } = schema.parse(req.body);
  if (new Set(ids).size !== ids.length) throw new HttpError('单元排序包含重复项', 400);

  const banks = await prisma.bank.findMany({ where: { subjectId }, select: { id: true } });
  const existingIds = new Set(banks.map((bank) => bank.id));
  if (ids.length !== banks.length || ids.some((id) => !existingIds.has(id))) {
    throw new HttpError('单元排序数据与当前科目不一致，请刷新后重试', 400);
  }

  await prisma.$transaction(ids.map((id, index) => prisma.bank.update({
    where: { id },
    data: { sortOrder: index }
  })));
  return ok(res, true, '排序已保存');
}));

router.put('/banks/:id', asyncHandler(async (req, res) => {
  const schema = z.object({ subjectId: z.string().optional(), name: z.string().min(1).optional(), description: z.string().optional(), sortOrder: z.number().optional(), isActive: z.boolean().optional() });
  const input = schema.parse(req.body);
  const bank = await prisma.bank.update({ where: { id: req.params.id }, data: input });
  return ok(res, bank, '保存成功');
}));

router.delete('/banks/:id/questions', asyncHandler(async (req, res) => {
  const bank = await prisma.bank.findUnique({ where: { id: req.params.id }, select: { id: true } });
  if (!bank) throw new HttpError('题库不存在', 404);
  const result = await prisma.question.deleteMany({ where: { bankId: req.params.id } });
  return ok(res, { deletedCount: result.count }, '清空成功');
}));

router.delete('/banks/:id', asyncHandler(async (req, res) => {
  await prisma.bank.delete({ where: { id: req.params.id } });
  return ok(res, true, '删除成功');
}));

router.get('/questions', asyncHandler(async (req, res) => {
  const page = toInt(req.query.page, 1);
  const pageSize = Math.min(toInt(req.query.pageSize, 20), 100);
  const bankId = String(req.query.bankId || '').trim();
  const keyword = String(req.query.keyword || '').trim();
  const type = String(req.query.type || '').trim();
  const where: any = {};
  if (bankId) where.bankId = bankId;
  if (type) where.type = type;
  if (keyword) where.stem = { contains: keyword };
  const [total, rows] = await Promise.all([
    prisma.question.count({ where }),
    prisma.question.findMany({
      where,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { bank: { include: { subject: true } }, options: { orderBy: { sortOrder: 'asc' } } }
    })
  ]);
  return ok(res, { rows, meta: pageMeta(page, pageSize, total) });
}));


function normalizeQuestionInput<T extends {
  type?: string;
  answer?: string[] | string[][];
  options?: Array<{ label: string; content: string }>;
}>(input: T) {
  if (input.type === 'fill') {
    return {
      ...input,
      answer: normalizeFillQuestionAnswer(input.answer || []),
      options: []
    };
  }
  if (input.type !== 'judge') {
    if (input.type === 'python') return input;
    return {
      ...input,
      answer: normalizeChoiceQuestionAnswer(input.type || 'multiple', input.answer || [])
    };
  }
  return {
    ...input,
    answer: normalizeJudgeAnswerArray(normalizeChoiceQuestionAnswer('judge', input.answer || [])),
    options: normalizeJudgeOptionsForStorage()
  };
}

const questionTypeSchema = z.enum(['single', 'multiple', 'judge', 'fill', 'python', 'reading']);
const questionTypeLabelSchema = z.string().trim().max(40, '题型标签不能超过 40 个字符').optional();
const questionOptionSchema = z.object({
  label: z.string().trim().min(1, '选项标识不能为空').max(20, '选项标识不能超过 20 个字符'),
  content: z.string().max(100000, '选项内容过长')
});
const answerListSchema = z.array(z.string().trim().max(100000)).max(20, '答案项不能超过 20 个');
const fillAnswerSchema = z.union([
  answerListSchema,
  z.array(answerListSchema).max(20, '填空数量不能超过 20 个')
]);

function normalizeFillQuestionAnswer(answer: unknown): string[] | string[][] {
  if (Array.isArray(answer) && answer.some((item) => Array.isArray(item))) {
    return answer
      .map((item) => Array.isArray(item) ? item.map((value) => String(value).trim()).filter(Boolean) : [])
      .filter((group) => group.length > 0);
  }
  return Array.isArray(answer) ? answer.map((item) => String(item).trim()).filter(Boolean) : [];
}

function hasFillQuestionAnswer(answer: string[] | string[][]) {
  return Array.isArray(answer) && answer.length > 0 && answer.every((item) => (
    Array.isArray(item) ? item.length > 0 : Boolean(String(item || '').trim())
  ));
}

function choiceAnswerList(answer: string[] | string[][]): string[] {
  return Array.isArray(answer) ? answer.filter((item): item is string => typeof item === 'string') : [];
}

function normalizeChoiceQuestionAnswer(type: string, answer: string[] | string[][]): string[] {
  return normalizeAnswerForObjectiveType(type, choiceAnswerList(answer));
}

function rejectReadingQuestionWrite(type?: string) {
  if (type === 'reading') {
    throw new HttpError('阅读理解请使用阅读短文与小题的统一保存入口', 400);
  }
}

function validateQuestionDefinition(input: {
  type: string;
  answer: string[] | string[][];
  options: Array<{ label: string; content: string }>;
}) {
  if (input.type === 'python') return;
  if (input.type === 'fill') {
    if (!hasFillQuestionAnswer(input.answer)) throw new HttpError('请设置填空题正确答案', 400);
    return;
  }
  const answer = choiceAnswerList(input.answer);
  const labels = input.options.map((option) => option.label);
  if (!labels.length) throw new HttpError('选择题必须至少包含一个选项', 400);
  if (new Set(labels).size !== labels.length) throw new HttpError('选项标识不能重复', 400);
  if (!answer.length) throw new HttpError('请设置正确答案', 400);
  if (answer.some((item) => !labels.includes(item))) {
    throw new HttpError('正确答案必须对应已有选项', 400);
  }
  if (['single', 'judge'].includes(input.type) && answer.length !== 1) {
    throw new HttpError('单选题和判断题只能设置一个正确答案', 400);
  }
}

router.get('/reading-passages/:passageId', asyncHandler(async (req, res) => {
  const bankId = String(req.query.bankId || '').trim();
  const passageId = String(req.params.passageId || '').trim();
  return ok(res, await getAdminReadingPassage(bankId, passageId));
}));

router.post('/reading-passages', asyncHandler(async (req, res) => {
  return ok(res, await saveAdminReadingPassage(req.body), '保存成功');
}));

router.post('/questions', asyncHandler(async (req, res) => {
  const schema = z.object({
    bankId: z.string().trim().min(1), type: questionTypeSchema.default('single'), typeLabel: questionTypeLabelSchema, stem: z.string().trim().min(1),
    score: z.number().min(0).max(10000).optional(), difficulty: z.string().max(30).optional(), explanation: z.string().max(500000).optional(),
    answer: fillAnswerSchema.default([]), tags: z.array(z.string().max(100)).max(50).default([]),
    options: z.array(questionOptionSchema).max(100).default([])
  });
  const parsed = schema.parse(req.body);
  rejectReadingQuestionWrite(parsed.type);
  const input = normalizeQuestionInput(parsed);
  validateQuestionDefinition(input);
  const question = await prisma.question.create({
    data: {
      bankId: input.bankId,
      type: input.type,
      typeLabel: input.type === 'python' ? input.typeLabel || null : null,
      stem: input.stem,
      score: input.score ?? 0,
      difficulty: input.difficulty,
      explanation: input.explanation,
      answerJson: input.answer,
      tagsJson: input.tags,
      options: input.type === 'python' || input.type === 'fill'
        ? undefined
        : { create: input.options.map((option, index) => ({ label: option.label, content: option.content, isCorrect: choiceAnswerList(input.answer).includes(option.label), sortOrder: index })) }
    },
    include: { options: true }
  });
  return ok(res, question, '创建成功');
}));

router.put('/questions/:id', asyncHandler(async (req, res) => {
  const schema = z.object({
    bankId: z.string().trim().min(1).optional(), type: questionTypeSchema.optional(), typeLabel: questionTypeLabelSchema, stem: z.string().trim().min(1).optional(),
    score: z.number().min(0).max(10000).optional(), difficulty: z.string().max(30).optional(),
    explanation: z.string().max(500000).optional(), isActive: z.boolean().optional(),
    answer: fillAnswerSchema.optional(), tags: z.array(z.string().max(100)).max(50).optional(),
    options: z.array(questionOptionSchema).max(100).optional()
  });
  const parsed = schema.parse(req.body);
  rejectReadingQuestionWrite(parsed.type);
  const question = await prisma.$transaction(async (tx) => {
    const current = await tx.question.findUnique({
      where: { id: req.params.id },
      include: { options: { orderBy: { sortOrder: 'asc' } } }
    });
    if (!current) throw new HttpError('题目不存在', 404);
    rejectReadingQuestionWrite(current.type);

    const merged = normalizeQuestionInput({
      ...parsed,
      type: parsed.type ?? current.type,
      answer: parsed.answer ?? (Array.isArray(current.answerJson) ? current.answerJson as string[] | string[][] : []),
      options: parsed.options ?? current.options.map((option) => ({ label: option.label, content: option.content }))
    });
    validateQuestionDefinition(merged);

    const { options, answer, tags, typeLabel, ...rest } = parsed;
    const nextTypeLabel = typeof typeLabel !== 'undefined'
      ? typeLabel || null
      : parsed.type && merged.type !== 'python'
        ? null
        : undefined;
    const questionUpdateData: any = {
      ...rest,
      type: merged.type,
      ...(typeof nextTypeLabel !== 'undefined' ? { typeLabel: nextTypeLabel } : {}),
      answerJson: merged.answer,
      ...(tags ? { tagsJson: tags } : {})
    };
    const saved = await tx.question.update({
      where: { id: current.id },
      data: questionUpdateData
    });

    if (options || merged.type === 'judge' || merged.type === 'fill' || merged.type === 'python') {
      await tx.questionOption.deleteMany({ where: { questionId: saved.id } });
      const optionData = merged.options.map((option, index) => ({
        questionId: saved.id,
        label: option.label,
        content: option.content,
        isCorrect: choiceAnswerList(merged.answer).includes(option.label),
        sortOrder: index
      }));
      if (optionData.length) await tx.questionOption.createMany({ data: optionData });
    } else if (answer) {
      const optionRows = await tx.questionOption.findMany({
        where: { questionId: saved.id },
        select: { id: true, label: true }
      });
      for (const option of optionRows) {
        await tx.questionOption.update({
          where: { id: option.id },
          data: { isCorrect: choiceAnswerList(merged.answer).includes(option.label) }
        });
      }
    }

    return tx.question.findUniqueOrThrow({
      where: { id: saved.id },
      include: { options: { orderBy: { sortOrder: 'asc' } } }
    });
  });
  return ok(res, question, '保存成功');
}));

router.delete('/questions/:id', asyncHandler(async (req, res) => {
  await prisma.question.delete({ where: { id: req.params.id } });
  return ok(res, true, '删除成功');
}));

router.post('/import/json', asyncHandler(async (req, res) => {
  try {
    const body = req.body || {};
    const payload = body.payload ?? body;
    const target = { subjectId: body.subjectId, bankId: body.bankId };
    const result = await importLegacyBankJson(payload, target);
    return ok(res, result, '导入成功');
  } catch (error) {
    return fail(res, error instanceof Error ? error.message : '导入失败');
  }
}));

export default router;
