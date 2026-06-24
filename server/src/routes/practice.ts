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
import { ok } from '../utils/http.js';

const router = Router();
router.use(authRequired);

const answerSchema = z.object({
  questionId: z.string().min(1),
  selected: z.array(z.string().max(5000)).max(20).default([]),
  clientAnswerId: z.string().trim().min(1).max(120).optional(),
  durationSeconds: z.number().int().min(0).max(30 * 60).optional().default(0)
});

function getSubjectId(query: unknown) {
  const value = String(query || '').trim();
  return value || undefined;
}

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
