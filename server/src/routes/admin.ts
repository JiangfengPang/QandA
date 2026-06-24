import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { UserRole, type UserRole as UserRoleType } from '../utils/roles.js';
import { prisma } from '../db/prisma.js';
import { adminRequired, authRequired } from '../middleware/auth.js';
import { importLegacyBankJson } from '../services/importService.js';
import { fail, ok, pageMeta, toInt, HttpError } from '../utils/http.js';
import { validatePasswordStrength } from '../utils/passwordPolicy.js';
import { normalizeJudgeAnswerArray, normalizeJudgeOptionsForStorage } from '../utils/judge.js';
import { createToken } from '../services/authService.js';
import { setAuthCookies } from '../utils/cookie.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { adminAuditMiddleware, getAdminActionOptions } from '../services/adminAuditService.js';
import { getAdminActivityStats } from '../services/adminAnalyticsService.js';
import { assertAllowedNickname, hasForbiddenNickname } from '../utils/nicknamePolicy.js';
import {
  createAnnouncement,
  deleteAnnouncement,
  listAdminAnnouncements,
  updateAnnouncement
} from '../services/announcementService.js';

const router = Router();
router.use(authRequired, adminRequired);
router.use(adminAuditMiddleware);

router.get('/dashboard', asyncHandler(async (_req, res) => {
  const [userCount, subjectCount, bankCount, questionCount, answerCount] = await Promise.all([
    prisma.user.count(),
    prisma.subject.count(),
    prisma.bank.count(),
    prisma.question.count(),
    prisma.userAnswer.count()
  ]);
  return ok(res, { userCount, subjectCount, bankCount, questionCount, answerCount });
}));

router.get('/activity', asyncHandler(async (req, res) => {
  const days = Math.min(Math.max(toInt(req.query.days, 14), 7), 30);
  return ok(res, await getAdminActivityStats(days));
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
  const keyword = String(req.query.keyword || '').trim();
  const where = {
    role: UserRole.STUDENT,
    ...(keyword ? { OR: [{ email: { contains: keyword } }, { nickname: { contains: keyword } }] } : {})
  };
  const [total, rows] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: { id: true, email: true, nickname: true, role: true, isActive: true, createdAt: true }
    })
  ]);
  return ok(res, {
    rows: rows.map((row) => ({ ...row, nicknameViolation: hasForbiddenNickname(row.nickname) })),
    meta: pageMeta(page, pageSize, total)
  });
}));

router.patch('/users/:id', asyncHandler(async (req, res) => {
  const schema = z.object({ isActive: z.boolean().optional(), nickname: z.string().max(80).optional() });
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
    select: { id: true, email: true, nickname: true, role: true, isActive: true }
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
  const schema = z.object({ isActive: z.boolean().optional(), nickname: z.string().max(80).optional() });
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
      newPassword: z.string().min(12, '新密码至少 12 位').max(100)
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
  const [subjectCount, bankCount, questionCount, userCount, answerCount] = await Promise.all([
    prisma.subject.count(),
    prisma.bank.count(),
    prisma.question.count(),
    prisma.user.count(),
    prisma.userAnswer.count()
  ]);
  return ok(res, {
    api: 'ok',
    database: 'ok',
    subjectCount,
    bankCount,
    questionCount,
    userCount,
    answerCount,
    checkedAt: new Date().toISOString()
  });
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
  answer?: string[];
  options?: Array<{ label: string; content: string }>;
}>(input: T) {
  if (input.type !== 'judge') return input;
  return {
    ...input,
    answer: normalizeJudgeAnswerArray(input.answer || []),
    options: normalizeJudgeOptionsForStorage()
  };
}

const questionTypeSchema = z.enum(['single', 'multiple', 'judge', 'python']);
const questionOptionSchema = z.object({
  label: z.string().trim().min(1, '选项标识不能为空').max(20, '选项标识不能超过 20 个字符'),
  content: z.string().max(100000, '选项内容过长')
});
const answerListSchema = z.array(z.string().trim().max(100000)).max(20, '答案项不能超过 20 个');

function validateQuestionDefinition(input: {
  type: string;
  answer: string[];
  options: Array<{ label: string; content: string }>;
}) {
  if (input.type === 'python') return;
  const labels = input.options.map((option) => option.label);
  if (!labels.length) throw new HttpError('选择题必须至少包含一个选项', 400);
  if (new Set(labels).size !== labels.length) throw new HttpError('选项标识不能重复', 400);
  if (!input.answer.length) throw new HttpError('请设置正确答案', 400);
  if (input.answer.some((answer) => !labels.includes(answer))) {
    throw new HttpError('正确答案必须对应已有选项', 400);
  }
  if (['single', 'judge'].includes(input.type) && input.answer.length !== 1) {
    throw new HttpError('单选题和判断题只能设置一个正确答案', 400);
  }
}

router.post('/questions', asyncHandler(async (req, res) => {
  const schema = z.object({
    bankId: z.string().trim().min(1), type: questionTypeSchema.default('single'), stem: z.string().trim().min(1),
    score: z.number().min(0).max(10000).optional(), difficulty: z.string().max(30).optional(), explanation: z.string().max(500000).optional(),
    answer: answerListSchema.default([]), tags: z.array(z.string().max(100)).max(50).default([]),
    options: z.array(questionOptionSchema).max(100).default([])
  });
  const input = normalizeQuestionInput(schema.parse(req.body));
  validateQuestionDefinition(input);
  const question = await prisma.question.create({
    data: {
      bankId: input.bankId,
      type: input.type,
      stem: input.stem,
      score: input.score ?? 0,
      difficulty: input.difficulty,
      explanation: input.explanation,
      answerJson: input.answer,
      tagsJson: input.tags,
      options: { create: input.options.map((option, index) => ({ label: option.label, content: option.content, isCorrect: input.answer.includes(option.label), sortOrder: index })) }
    },
    include: { options: true }
  });
  return ok(res, question, '创建成功');
}));

router.put('/questions/:id', asyncHandler(async (req, res) => {
  const schema = z.object({
    bankId: z.string().trim().min(1).optional(), type: questionTypeSchema.optional(), stem: z.string().trim().min(1).optional(),
    score: z.number().min(0).max(10000).optional(), difficulty: z.string().max(30).optional(),
    explanation: z.string().max(500000).optional(), isActive: z.boolean().optional(),
    answer: answerListSchema.optional(), tags: z.array(z.string().max(100)).max(50).optional(),
    options: z.array(questionOptionSchema).max(100).optional()
  });
  const parsed = schema.parse(req.body);
  const question = await prisma.$transaction(async (tx) => {
    const current = await tx.question.findUnique({
      where: { id: req.params.id },
      include: { options: { orderBy: { sortOrder: 'asc' } } }
    });
    if (!current) throw new HttpError('题目不存在', 404);

    const merged = normalizeQuestionInput({
      ...parsed,
      type: parsed.type ?? current.type,
      answer: parsed.answer ?? (Array.isArray(current.answerJson) ? current.answerJson.map(String) : []),
      options: parsed.options ?? current.options.map((option) => ({ label: option.label, content: option.content }))
    });
    validateQuestionDefinition(merged);

    const { options, answer, tags, ...rest } = parsed;
    const saved = await tx.question.update({
      where: { id: current.id },
      data: {
        ...rest,
        type: merged.type,
        answerJson: merged.answer,
        ...(tags ? { tagsJson: tags } : {})
      }
    });

    if (options || merged.type === 'judge') {
      await tx.questionOption.deleteMany({ where: { questionId: saved.id } });
      const optionData = merged.options.map((option, index) => ({
        questionId: saved.id,
        label: option.label,
        content: option.content,
        isCorrect: merged.answer.includes(option.label),
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
          data: { isCorrect: merged.answer.includes(option.label) }
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
