import { z } from 'zod';

const sessionRecordSchema = z.object({
  correct: z.boolean(),
  userAnswer: z.array(z.string().max(5000)).max(20).default([]),
  answer: z.array(z.string().max(5000)).max(20).default([]),
  explanation: z.string().max(20_000).default(''),
  clientAnswerId: z.string().trim().min(1).max(120).optional(),
  syncStatus: z.enum(['pending', 'synced', 'failed']).optional()
}).strict();
export const sessionSnapshotSchema = z.object({
  version: z.literal(1),
  practiceSessionId: z.string().trim().min(1).max(191).optional(),
  scope: z.string().trim().max(120).optional(),
  submitted: z.boolean().optional(),
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
