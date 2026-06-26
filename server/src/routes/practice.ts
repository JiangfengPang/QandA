import { Router } from 'express';
import { z } from 'zod';
import { authRequired } from '../middleware/auth.js';
import {
  clearFavoriteQuestions,
  clearPracticeRecords,
  clearWrongQuestions,
  listFavoriteQuestions,
  listWrongQuestions,
  removeFavoriteQuestion,
  removeWrongQuestion,
  submitPracticeAnswer,
  toggleFavoriteQuestion
} from '../services/practiceRecordService.js';
import { getPracticeReviewSummary, getPracticeStats } from '../services/practiceStatsService.js';
import {
  deletePracticeSession,
  getPracticeSession,
  savePracticeSession
} from '../services/practiceSessionService.js';
import { ok } from '../utils/http.js';

const router = Router();
router.use(authRequired);

const answerSchema = z.object({
  questionId: z.string().min(1),
  selected: z.array(z.string().max(5000)).max(20).default([]),
  clientAnswerId: z.string().trim().min(1).max(120).optional(),
  durationSeconds: z.number().int().min(0).max(30 * 60).optional().default(0)
});

const sessionKeySchema = z.string().trim().min(1).max(191);
const sessionRecordSchema = z.object({
  correct: z.boolean(),
  userAnswer: z.array(z.string().max(5000)).max(20).default([]),
  answer: z.array(z.string().max(5000)).max(20).default([]),
  explanation: z.string().max(20_000).default(''),
  clientAnswerId: z.string().trim().min(1).max(120).optional(),
  syncStatus: z.enum(['pending', 'synced', 'failed']).optional()
}).strict();
const sessionSnapshotSchema = z.object({
  version: z.literal(1),
  currentIndex: z.number().int().min(0).max(100_000),
  questionId: z.string().trim().min(1).max(191),
  questionIds: z.array(z.string().trim().min(1).max(191)).min(1).max(5000),
  sessionRecords: z.record(z.string().trim().min(1).max(191), sessionRecordSchema).default({}),
  updatedAt: z.string().trim().max(80).optional().default('')
}).strict().superRefine((value, context) => {
  if (value.currentIndex >= value.questionIds.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['currentIndex'],
      message: 'currentIndex 超出题目范围'
    });
  }

  if (JSON.stringify(value).length > 1_000_000) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: '练习会话数据过大'
    });
  }
});
const saveSessionSchema = z.object({
  key: sessionKeySchema,
  snapshot: sessionSnapshotSchema
});

function getSubjectId(query: unknown) {
  const value = String(query || '').trim();
  return value || undefined;
}

function getSessionKey(query: unknown) {
  return sessionKeySchema.parse(query);
}

router.get('/sessions', async (req, res, next) => {
  try {
    return ok(res, await getPracticeSession(req.auth!.userId, getSessionKey(req.query.key)));
  } catch (error) {
    return next(error);
  }
});

router.put('/sessions', async (req, res, next) => {
  try {
    const input = saveSessionSchema.parse(req.body);
    return ok(res, await savePracticeSession(req.auth!.userId, input.key, input.snapshot));
  } catch (error) {
    return next(error);
  }
});

router.delete('/sessions', async (req, res, next) => {
  try {
    return ok(res, await deletePracticeSession(req.auth!.userId, getSessionKey(req.query.key)));
  } catch (error) {
    return next(error);
  }
});

router.post('/answers', async (req, res, next) => {
  try {
    const input = answerSchema.parse(req.body);
    const result = await submitPracticeAnswer(req.auth!.userId, input.questionId, input.selected, input.durationSeconds, input.clientAnswerId);
    return ok(res, result);
  } catch (error) {
    return next(error);
  }
});

router.post('/favorites/:questionId/toggle', async (req, res, next) => {
  try {
    return ok(res, await toggleFavoriteQuestion(req.auth!.userId, req.params.questionId));
  } catch (error) {
    return next(error);
  }
});

router.delete('/wrongs/:questionId', async (req, res, next) => {
  try {
    return ok(res, await removeWrongQuestion(req.auth!.userId, req.params.questionId));
  } catch (error) {
    return next(error);
  }
});

router.delete('/wrongs', async (req, res, next) => {
  try {
    return ok(res, await clearWrongQuestions(req.auth!.userId, getSubjectId(req.query.subjectId)));
  } catch (error) {
    return next(error);
  }
});

router.delete('/favorites/:questionId', async (req, res, next) => {
  try {
    return ok(res, await removeFavoriteQuestion(req.auth!.userId, req.params.questionId));
  } catch (error) {
    return next(error);
  }
});

router.delete('/favorites', async (req, res, next) => {
  try {
    return ok(res, await clearFavoriteQuestions(req.auth!.userId, getSubjectId(req.query.subjectId)));
  } catch (error) {
    return next(error);
  }
});

router.get('/favorites', async (req, res, next) => {
  try {
    return ok(res, await listFavoriteQuestions(req.auth!.userId));
  } catch (error) {
    return next(error);
  }
});

router.get('/wrongs', async (req, res, next) => {
  try {
    return ok(res, await listWrongQuestions(req.auth!.userId));
  } catch (error) {
    return next(error);
  }
});

router.delete('/records', async (req, res, next) => {
  try {
    return ok(res, await clearPracticeRecords(req.auth!.userId));
  } catch (error) {
    return next(error);
  }
});

router.get('/stats', async (req, res, next) => {
  try {
    return ok(res, await getPracticeStats(req.auth!.userId, getSubjectId(req.query.subjectId)));
  } catch (error) {
    return next(error);
  }
});

router.get('/review-summary', async (req, res, next) => {
  try {
    return ok(res, await getPracticeReviewSummary(req.auth!.userId));
  } catch (error) {
    return next(error);
  }
});

export default router;
