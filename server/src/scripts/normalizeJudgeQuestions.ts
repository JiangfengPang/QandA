import { prisma } from '../db/prisma.js';
import { normalizeJudgeAnswerArray, normalizeJudgeOptionsForStorage } from '../utils/judge.js';

async function main() {
  const questions = await prisma.question.findMany({
    where: { type: 'judge' },
    select: { id: true, answerJson: true }
  });

  let questionCount = 0;
  for (const question of questions) {
    const answer = normalizeJudgeAnswerArray(question.answerJson);
    const options = normalizeJudgeOptionsForStorage();
    await prisma.$transaction([
      prisma.question.update({
        where: { id: question.id },
        data: { answerJson: answer }
      }),
      prisma.questionOption.deleteMany({ where: { questionId: question.id } }),
      prisma.questionOption.createMany({
        data: options.map((option, index) => ({
          questionId: question.id,
          label: option.label,
          content: option.content,
          isCorrect: answer.includes(option.label),
          sortOrder: index
        }))
      }),
      prisma.userAnswer.updateMany({
        where: { questionId: question.id, selectedJson: { equals: ['true'] as any } },
        data: { selectedJson: ['A'] }
      }),
      prisma.userAnswer.updateMany({
        where: { questionId: question.id, selectedJson: { equals: ['false'] as any } },
        data: { selectedJson: ['B'] }
      })
    ]);
    questionCount += 1;
  }

  console.log(`判断题格式规范完成：${questionCount} 道题已统一为 A 正确 / B 错误。`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
