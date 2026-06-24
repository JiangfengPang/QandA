import { Router } from 'express';
import { prisma } from '../db/prisma.js';
import { authRequired } from '../middleware/auth.js';
import { getBankQuestions, getSubjectQuestions } from '../services/questionService.js';
import { getBanksProgress } from '../services/progressService.js';
import { ok, fail } from '../utils/http.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
  listPublishedAnnouncements,
  markAllPublishedAnnouncementsRead,
  markAnnouncementRead
} from '../services/announcementService.js';

const router = Router();

router.get('/health', asyncHandler(async (_req, res) => {
  await prisma.$queryRaw`SELECT 1`;
  return ok(res, { status: 'ok', service: 'qanda-server', database: 'ok' });
}));

router.get('/announcements', authRequired, asyncHandler(async (req, res) => {
  return ok(res, await listPublishedAnnouncements(req.auth!.userId));
}));

router.post('/announcements/read-all', authRequired, asyncHandler(async (req, res) => {
  return ok(res, await markAllPublishedAnnouncementsRead(req.auth!.userId), '已全部标记为已读');
}));

router.post('/announcements/:id/read', authRequired, asyncHandler(async (req, res) => {
  return ok(res, await markAnnouncementRead(req.auth!.userId, req.params.id), '已标记为已读');
}));

router.get('/subjects', authRequired, asyncHandler(async (_req, res) => {
  const subjects = await prisma.subject.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    include: { banks: { where: { isActive: true }, select: { id: true } } }
  });
  return ok(res, subjects.map((item) => ({
    id: item.id,
    name: item.name,
    description: item.description,
    color: item.color,
    bankCount: item.banks.length
  })));
}));


router.get('/subjects/:subjectId/questions', authRequired, asyncHandler(async (req, res) => {
  const subject = await prisma.subject.findUnique({
    where: { id: req.params.subjectId },
    select: { id: true, name: true, description: true, isActive: true }
  });
  if (!subject || !subject.isActive) return fail(res, '科目不存在', 404);

  const questions = await getSubjectQuestions(req.params.subjectId, req.auth!.userId);
  return ok(res, {
    bank: {
      id: subject.id,
      subjectId: subject.id,
      subjectName: subject.name,
      name: '全部单元',
      description: subject.description
    },
    questions
  });
}));

router.get('/subjects/:subjectId/banks', authRequired, asyncHandler(async (req, res) => {
  const userId = req.auth!.userId;
  const subject = await prisma.subject.findFirst({
    where: { id: req.params.subjectId, isActive: true },
    select: { id: true }
  });
  if (!subject) return fail(res, '科目不存在', 404);

  const banks = await prisma.bank.findMany({
    where: { subjectId: req.params.subjectId, isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    include: { _count: { select: { questions: { where: { isActive: true } } } } }
  });

  const progressByBank = await getBanksProgress(userId, banks.map((bank) => bank.id));
  const rows = banks.map((bank) => {
    const progress = progressByBank.get(bank.id);

    const answeredCount = progress?.answerCount || 0;
    const correctCount = progress?.correctCount || 0;
    const accuracy = progress?.accuracy || 0;
    const wrongQuestionCount = progress?.wrongQuestionCount || 0;

    return {
      id: bank.id,
      subjectId: bank.subjectId,
      name: bank.name,
      description: bank.description,
      questionCount: bank._count.questions,
      answeredCount,
      correctCount,
      accuracy,
      wrongQuestionCount
    };
  });

  return ok(res, rows);
}));

router.get('/banks/:bankId/questions', authRequired, asyncHandler(async (req, res) => {
  const bank = await prisma.bank.findUnique({
    where: { id: req.params.bankId },
    include: { subject: true }
  });
  if (!bank || !bank.isActive || !bank.subject.isActive) return fail(res, '题库不存在', 404);
  const questions = await getBankQuestions(req.params.bankId, req.auth!.userId);
  return ok(res, {
    bank: {
      id: bank.id,
      subjectId: bank.subjectId,
      subjectName: bank.subject.name,
      name: bank.name,
      description: bank.description
    },
    questions
  });
}));

export default router;
