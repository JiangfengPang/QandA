import { prisma } from '../db/prisma.js';
import { formatQuestion } from './questionService.js';
import { isAnswerCorrect, isFillAnswerCorrect } from '../utils/answer.js';
import { normalizeJudgeAnswerArray } from '../utils/judge.js';
import { HttpError } from '../utils/http.js';

function questionInclude(userId: string) {
  return {
    bank: { include: { subject: true } },
    options: { orderBy: { sortOrder: 'asc' as const } },
    favorites: { where: { userId } },
    wrongs: { where: { userId } },
    answers: { where: { userId }, orderBy: { createdAt: 'desc' as const }, take: 1 }
  };
}

async function scopedQuestionIds(subjectId: string) {
  const rows = await prisma.question.findMany({
    where: { isActive: true, bank: { subjectId, isActive: true, subject: { isActive: true } } },
    select: { id: true }
  });
  return rows.map((item) => item.id);
}

function normalizeClientAnswerId(value?: string) {
  const text = String(value || '').trim();
  return text || undefined;
}

function normalizeAnswerArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
  if (value === null || value === undefined) return [];
  return [String(value).trim()].filter(Boolean);
}

function fillAnswerDisplayArray(answer: unknown): string[] {
  if (Array.isArray(answer) && answer.some((item) => Array.isArray(item))) {
    return answer
      .map((item) => normalizeAnswerArray(item).join(' / '))
      .filter(Boolean);
  }
  return normalizeAnswerArray(answer);
}

export async function submitPracticeAnswer(userId: string, questionId: string, selected: string[], durationSeconds = 0, clientAnswerId?: string) {
  const safeClientAnswerId = normalizeClientAnswerId(clientAnswerId);
  const [question, user] = await Promise.all([
    prisma.question.findFirst({
      where: { id: questionId, isActive: true, bank: { isActive: true, subject: { isActive: true } } },
      include: { options: { select: { label: true } } }
    }),
    prisma.user.findUnique({ where: { id: userId }, select: { autoAddWrong: true } })
  ]);
  if (!question) throw new HttpError('题目不存在或已停用', 404);

  const selectedForStorage = question.type === 'judge' ? normalizeJudgeAnswerArray(selected) : selected;
  if (['single', 'multiple', 'judge'].includes(question.type)) {
    const allowedLabels = new Set(question.options.map((option) => option.label));
    if (selectedForStorage.some((item) => !allowedLabels.has(item))) {
      throw new HttpError('答案包含无效选项', 400);
    }
  }
  const answerForCheck = question.type === 'judge' ? normalizeJudgeAnswerArray(question.answerJson) : question.answerJson;
  const correct = question.type === 'fill'
    ? isFillAnswerCorrect(selectedForStorage, answerForCheck)
    : isAnswerCorrect(selectedForStorage, answerForCheck);
  let writeResult: { recorded: boolean; correct: boolean };
  try {
    writeResult = await prisma.$transaction(async (tx) => {
      if (safeClientAnswerId) {
        const existing = await tx.userAnswer.findUnique({
          where: { userId_clientAnswerId: { userId, clientAnswerId: safeClientAnswerId } },
          select: { questionId: true, isCorrect: true }
        });
        if (existing) {
          if (existing.questionId !== question.id) {
            throw new HttpError('重复提交标识已用于其他题目', 409);
          }
          return { recorded: false, correct: existing.isCorrect };
        }
      }

      await tx.userAnswer.create({
        data: {
          userId,
          questionId: question.id,
          clientAnswerId: safeClientAnswerId,
          selectedJson: selectedForStorage,
          isCorrect: correct,
          durationSeconds: Math.max(0, Math.min(Math.floor(Number(durationSeconds) || 0), 30 * 60))
        }
      });

      if (!correct && (user?.autoAddWrong ?? true)) {
        await tx.wrongQuestion.upsert({
          where: { userId_questionId: { userId, questionId: question.id } },
          update: { wrongCount: { increment: 1 }, lastAnsweredAt: new Date() },
          create: { userId, questionId: question.id, wrongCount: 1 }
        });
      }

      return { recorded: true, correct };
    });
  } catch (error) {
    if (safeClientAnswerId && (error as { code?: string }).code === 'P2002') {
      const existing = await prisma.userAnswer.findUnique({
        where: { userId_clientAnswerId: { userId, clientAnswerId: safeClientAnswerId } },
        select: { questionId: true, isCorrect: true }
      });
      if (existing) {
        if (existing.questionId !== question.id) {
          throw new HttpError('重复提交标识已用于其他题目', 409);
        }
        writeResult = { recorded: false, correct: existing.isCorrect };
      } else {
        throw error;
      }
    } else {
      throw error;
    }
  }

  return {
    correct: writeResult.correct,
    answer: question.type === 'fill' ? fillAnswerDisplayArray(answerForCheck) : answerForCheck,
    explanation: question.explanation,
    recorded: writeResult.recorded
  };
}

export async function toggleFavoriteQuestion(userId: string, questionId: string) {
  const question = await prisma.question.findFirst({
    where: { id: questionId, isActive: true, bank: { isActive: true, subject: { isActive: true } } },
    select: { id: true }
  });
  if (!question) throw new HttpError('题目不存在或已停用', 404);

  const existed = await prisma.userFavorite.findUnique({ where: { userId_questionId: { userId, questionId } } });
  if (existed) {
    await prisma.userFavorite.delete({ where: { id: existed.id } });
    return { favorite: false };
  }

  await prisma.userFavorite.create({ data: { userId, questionId } });
  return { favorite: true };
}

export async function removeWrongQuestion(userId: string, questionId: string) {
  await prisma.wrongQuestion.deleteMany({ where: { userId, questionId } });
  return { removed: true };
}

export async function clearWrongQuestions(userId: string, subjectId?: string) {
  if (!subjectId) {
    await prisma.wrongQuestion.deleteMany({ where: { userId } });
    return { cleared: true };
  }
  const ids = await scopedQuestionIds(subjectId);
  await prisma.wrongQuestion.deleteMany({ where: { userId, questionId: { in: ids } } });
  return { cleared: true };
}

export async function removeFavoriteQuestion(userId: string, questionId: string) {
  await prisma.userFavorite.deleteMany({ where: { userId, questionId } });
  return { removed: true };
}

export async function clearFavoriteQuestions(userId: string, subjectId?: string) {
  if (!subjectId) {
    await prisma.userFavorite.deleteMany({ where: { userId } });
    return { cleared: true };
  }
  const ids = await scopedQuestionIds(subjectId);
  await prisma.userFavorite.deleteMany({ where: { userId, questionId: { in: ids } } });
  return { cleared: true };
}

export async function clearPracticeRecords(userId: string) {
  await prisma.$transaction([
    prisma.userAnswer.deleteMany({ where: { userId } }),
    prisma.wrongQuestion.deleteMany({ where: { userId } }),
    prisma.userFavorite.deleteMany({ where: { userId } })
  ]);
  return { cleared: true };
}

export async function listFavoriteQuestions(userId: string) {
  const rows = await prisma.userFavorite.findMany({
    where: { userId, question: { isActive: true, bank: { isActive: true, subject: { isActive: true } } } },
    orderBy: { createdAt: 'desc' },
    include: { question: { include: questionInclude(userId) } }
  });
  return rows.map((row) => formatQuestion(row.question, userId));
}

export async function listWrongQuestions(userId: string) {
  const rows = await prisma.wrongQuestion.findMany({
    where: { userId, question: { isActive: true, bank: { isActive: true, subject: { isActive: true } } } },
    orderBy: { lastAnsweredAt: 'desc' },
    include: { question: { include: questionInclude(userId) } }
  });
  return rows.map((row) => formatQuestion(row.question, userId));
}
