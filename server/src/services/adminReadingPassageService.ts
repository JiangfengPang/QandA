import { z } from 'zod';
import { prisma } from '../db/prisma.js';
import { HttpError } from '../utils/http.js';

const readingOptionSchema = z.object({
  label: z.string().trim().min(1, '选项标识不能为空').max(20, '选项标识不能超过 20 个字符'),
  content: z.string().max(100000, '选项内容过长')
});

const readingPassageQuestionSchema = z.object({
  id: z.string().trim().optional(),
  readingQuestion: z.string().trim().min(1, '请输入阅读理解小题题干').max(100000),
  answer: z.string().trim().min(1, '请选择正确答案').max(20),
  explanation: z.string().max(500000).optional(),
  options: z.array(readingOptionSchema).min(2, '每道小题至少需要 2 个选项').max(100)
});

const readingPassageSchema = z.object({
  bankId: z.string().trim().min(1),
  stem: z.string().trim().min(1, '请输入阅读理解总题干'),
  score: z.number().min(0).max(10000).optional(),
  passageId: z.string().trim().min(1, '请输入阅读理解短文 ID').max(120),
  readingPassage: z.string().trim().min(1, '请输入阅读理解原文').max(500000),
  questions: z.array(readingPassageQuestionSchema).min(1, '请至少添加 1 道阅读理解小题').max(100)
});

function rawObject(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function readingPassageId(row: { rawJson?: unknown }) {
  return String(rawObject(row.rawJson).passageId || '').trim();
}

export async function getAdminReadingPassage(bankId: string, passageId: string) {
  if (!bankId) throw new HttpError('请选择题库', 400);
  if (!passageId) throw new HttpError('请输入阅读理解短文 ID', 400);

  const rows = await prisma.question.findMany({
    where: { bankId, type: 'reading' },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    include: { options: { orderBy: { sortOrder: 'asc' } } }
  });
  return rows.filter((row) => readingPassageId(row) === passageId);
}

export async function saveAdminReadingPassage(payload: unknown) {
  const input = readingPassageSchema.parse(payload);
  const bank = await prisma.bank.findUnique({ where: { id: input.bankId }, select: { id: true } });
  if (!bank) throw new HttpError('题库不存在', 404);

  for (let index = 0; index < input.questions.length; index += 1) {
    const question = input.questions[index];
    const labels = question.options.map((option) => option.label);
    if (new Set(labels).size !== labels.length) throw new HttpError(`第 ${index + 1} 道小题选项标识不能重复`, 400);
    if (!labels.includes(question.answer)) throw new HttpError(`第 ${index + 1} 道小题正确答案必须对应已有选项`, 400);
  }

  return prisma.$transaction(async (tx) => {
    const allReadingRows = await tx.question.findMany({
      where: { bankId: input.bankId, type: 'reading' },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      include: { options: { orderBy: { sortOrder: 'asc' } } }
    });
    const existingRows = allReadingRows.filter((row) => readingPassageId(row) === input.passageId);
    const existingById = new Map(existingRows.map((row) => [row.id, row]));
    const maxSortOrder = allReadingRows.reduce((max, row) => Math.max(max, row.sortOrder || 0), -1);
    const usedIds = new Set<string>();
    const savedIds: string[] = [];

    for (let index = 0; index < input.questions.length; index += 1) {
      const item = input.questions[index];
      const existing = item.id ? existingById.get(item.id) : undefined;
      const saved = existing
        ? await tx.question.update({
            where: { id: existing.id },
            data: {
              bankId: input.bankId,
              legacyId: `${input.passageId}-${String(index + 1).padStart(3, '0')}`,
              type: 'reading',
              typeLabel: '阅读理解',
              score: input.score ?? 0,
              stem: input.stem,
              answerJson: [item.answer],
              explanation: item.explanation || null,
              rawJson: {
                passageId: input.passageId,
                readingPassage: input.readingPassage,
                readingQuestion: item.readingQuestion
              },
              sortOrder: existing.sortOrder,
              isActive: true
            }
          })
        : await tx.question.create({
            data: {
              bankId: input.bankId,
              legacyId: `${input.passageId}-${String(index + 1).padStart(3, '0')}`,
              type: 'reading',
              typeLabel: '阅读理解',
              score: input.score ?? 0,
              stem: input.stem,
              answerJson: [item.answer],
              explanation: item.explanation || null,
              rawJson: {
                passageId: input.passageId,
                readingPassage: input.readingPassage,
                readingQuestion: item.readingQuestion
              },
              sortOrder: maxSortOrder + index + 1,
              isActive: true
            }
          });
      usedIds.add(saved.id);
      savedIds.push(saved.id);
      await tx.questionOption.deleteMany({ where: { questionId: saved.id } });
      await tx.questionOption.createMany({
        data: item.options.map((option, optionIndex) => ({
          questionId: saved.id,
          label: option.label,
          content: option.content,
          isCorrect: option.label === item.answer,
          sortOrder: optionIndex
        }))
      });
    }

    const removedIds = existingRows.map((row) => row.id).filter((id) => !usedIds.has(id));
    if (removedIds.length) await tx.question.deleteMany({ where: { id: { in: removedIds } } });

    return tx.question.findMany({
      where: { id: { in: savedIds } },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      include: { options: { orderBy: { sortOrder: 'asc' } } }
    });
  });
}
