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
import { env } from '../config/env.js';
import { enqueuePracticeAnswerSessionSubmission, enqueuePracticeAnswerSubmissions } from '../services/practiceAnswerQueueService.js';

const router = Router();
router.use(authRequired);

const selectedAnswerSchema = z.union([
  z.string().max(5000),
  z.array(z.string().max(5000)).max(20)
]).default([]);

const answerSchema = z.object({
  questionId: z.string().min(1),
  selected: selectedAnswerSchema,
  clientAnswerId: z.string().trim().min(1).max(120).optional(),
  durationSeconds: z.number().int().min(0).max(30 * 60).optional().default(0),
  isCorrect: z.boolean().optional(),
  answer: z.array(z.string().max(5000)).max(50).optional(),
  explanation: z.string().max(20_000).optional()
});
const queuedAnswerSchema = answerSchema.extend({
  clientAnswerId: z.string().trim().min(1).max(120),
  isCorrect: z.boolean(),
  answer: z.array(z.string().max(5000)).max(50).default([]),
  explanation: z.string().max(20_000).default('')
});
const answerBatchSchema = z.object({
  practiceSessionId: z.string().trim().min(1).max(191).optional(),
  clientSubmissionId: z.string().trim().min(1).max(120).optional(),
  scopeType: z.string().trim().min(1).max(40).optional(),
  scopeId: z.string().trim().max(191).optional(),
  answers: z.array(queuedAnswerSchema).min(1).max(500)
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

function getOptionalQueryText(query: unknown) {
  const value = String(query || '').trim();
  return value || undefined;
}

function getSessionKey(query: unknown) {
  return sessionKeySchema.parse(query);
}

function canQueueClientEvaluatedAnswer(input: z.infer<typeof answerSchema>) {
  return env.practiceAnswerQueueEnabled && Boolean(input.clientAnswerId) && typeof input.isCorrect === 'boolean';
}

function queuedAnswerResult(input: z.infer<typeof queuedAnswerSchema>) {
  return {
    clientAnswerId: input.clientAnswerId,
    correct: input.isCorrect,
    answer: input.answer,
    explanation: input.explanation,
    recorded: false,
    queued: true
  };
}

function queuedAnswerResultWithStatus(input: z.infer<typeof queuedAnswerSchema>, queueStatus = 'queued') {
  return {
    ...queuedAnswerResult(input),
    queueStatus
  };
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
    if (canQueueClientEvaluatedAnswer(input)) {
      const queuedInput = queuedAnswerSchema.parse(input);
      const enqueueResult = await enqueuePracticeAnswerSubmissions(req.auth!.userId, [{
        questionId: queuedInput.questionId,
        selected: queuedInput.selected,
        clientAnswerId: queuedInput.clientAnswerId,
        durationSeconds: queuedInput.durationSeconds
      }]);
      return ok(res, queuedAnswerResultWithStatus(queuedInput, enqueueResult.results[0]?.status || 'queued'));
    }

    const result = await submitPracticeAnswer(req.auth!.userId, input.questionId, input.selected, input.durationSeconds, input.clientAnswerId);
    return ok(res, result);
  } catch (error) {
    return next(error);
  }
});

router.post('/answers/batch', async (req, res, next) => {
  try {
    const input = answerBatchSchema.parse(req.body);
    if (input.practiceSessionId) {
      const clientSubmissionId = input.clientSubmissionId || `${input.practiceSessionId}:${Date.now()}`;
      if (!env.practiceAnswerQueueEnabled) {
        const results: Array<{ clientAnswerId: string; correct: boolean; answer: unknown; explanation: string | null; recorded?: boolean }> = [];
        for (const item of input.answers) {
          const result = await submitPracticeAnswer(req.auth!.userId, item.questionId, item.selected, item.durationSeconds, item.clientAnswerId);
          results.push({ clientAnswerId: item.clientAnswerId, ...result });
        }
        return ok(res, {
          practiceSessionId: input.practiceSessionId,
          clientSubmissionId,
          accepted: results.length,
          queued: 0,
          submissionStatus: 'processed',
          results
        });
      }

      const enqueueResult = await enqueuePracticeAnswerSessionSubmission(req.auth!.userId, {
        practiceSessionId: input.practiceSessionId,
        clientSubmissionId,
        scopeType: input.scopeType,
        scopeId: input.scopeId,
        answers: input.answers.map((item) => ({
          questionId: item.questionId,
          selected: item.selected,
          clientAnswerId: item.clientAnswerId,
          durationSeconds: item.durationSeconds
        }))
      });
      const statusByClientAnswerId = new Map(enqueueResult.results.map((item) => [item.clientAnswerId, item.status]));
      return ok(res, {
        practiceSessionId: input.practiceSessionId,
        clientSubmissionId,
        accepted: enqueueResult.accepted,
        queued: enqueueResult.queued,
        submissionStatus: enqueueResult.submissionStatus,
        results: input.answers.map((item) => queuedAnswerResultWithStatus(item, statusByClientAnswerId.get(item.clientAnswerId) || 'queued'))
      });
    }

    if (!env.practiceAnswerQueueEnabled) {
      const results: Array<{ clientAnswerId: string; correct: boolean; answer: unknown; explanation: string | null; recorded?: boolean }> = [];
      for (const item of input.answers) {
        const result = await submitPracticeAnswer(req.auth!.userId, item.questionId, item.selected, item.durationSeconds, item.clientAnswerId);
        results.push({ clientAnswerId: item.clientAnswerId, ...result });
      }
      return ok(res, { accepted: results.length, queued: 0, results });
    }

    const enqueueResult = await enqueuePracticeAnswerSubmissions(req.auth!.userId, input.answers.map((item) => ({
      questionId: item.questionId,
      selected: item.selected,
      clientAnswerId: item.clientAnswerId,
      durationSeconds: item.durationSeconds
    })));
    const statusByClientAnswerId = new Map(enqueueResult.results.map((item) => [item.clientAnswerId, item.status]));
    return ok(res, {
      accepted: enqueueResult.accepted,
      queued: enqueueResult.inserted,
      results: input.answers.map((item) => queuedAnswerResultWithStatus(item, statusByClientAnswerId.get(item.clientAnswerId) || 'queued'))
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/favorites/:questionId/toggle', async (req, res, next) => {
  try {
    const desiredFavorite = typeof req.body?.favorite === 'boolean' ? req.body.favorite : undefined;
    return ok(res, await toggleFavoriteQuestion(req.auth!.userId, req.params.questionId, desiredFavorite));
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
    return ok(res, await getPracticeReviewSummary(req.auth!.userId, {
      subjectId: getOptionalQueryText(req.query.subjectId),
      bankId: getOptionalQueryText(req.query.bankId),
      scope: getOptionalQueryText(req.query.scope)
    }));
  } catch (error) {
    return next(error);
  }
});

export default router;
