import '../config/env.js';
import { prisma } from '../db/prisma.js';
import {
  assertPracticeSelectedAnswerAllowed,
  isObjectiveQuestionType,
  normalizeAllowedLabelsForQuestionType,
  normalizeAnswerForObjectiveType,
  normalizeRawAnswerInput,
  normalizeSelectedForPracticeStorage
} from '../utils/answerNormalization.js';

const SAMPLE_LIMIT = 20;
const FAILED_QUEUE_SAMPLE_LIMIT = 30;

type RiskItem = {
  questionId?: string;
  queueId?: string;
  type?: string;
  reason: string;
  detail: Record<string, unknown>;
};

function compact(value: unknown) {
  return JSON.parse(JSON.stringify(value ?? null));
}

function addSample(list: RiskItem[], item: RiskItem) {
  if (list.length < SAMPLE_LIMIT) list.push(item);
}

function sortedUnique(values: string[]) {
  return Array.from(new Set(values)).sort((left, right) => left.localeCompare(right, 'zh-CN'));
}

function answerInvalidItems(type: string, answer: unknown, optionLabels: string[]) {
  const normalizedAnswer = normalizeAnswerForObjectiveType(type, answer);
  const allowed = new Set(normalizeAllowedLabelsForQuestionType(type, optionLabels));
  return normalizedAnswer.filter((item) => !allowed.has(item));
}

function selectedInvalidItems(type: string, selected: unknown, optionLabels: string[]) {
  const selectedForStorage = normalizeSelectedForPracticeStorage(type, selected);
  const allowed = new Set(normalizeAllowedLabelsForQuestionType(type, optionLabels));
  return selectedForStorage.filter((item) => !allowed.has(item));
}

function classifyError(message: string | null) {
  const text = String(message || '').trim();
  if (!text) return 'empty';
  if (text.includes('答案包含无效选项')) return 'invalid_option';
  if (text.includes('单选题只能选择一个答案')) return 'single_multiple_selected';
  if (text.includes('题目不存在或已停用')) return 'question_inactive';
  if (text.includes('重复提交标识')) return 'duplicate_client_answer_id';
  if (text.includes('processor lock expired')) return 'processor_lock_expired';
  return text.slice(0, 80);
}

async function auditQuestions() {
  const questions = await prisma.question.findMany({
    where: { isActive: true, type: { in: ['single', 'multiple', 'judge', 'reading'] } },
    select: {
      id: true,
      type: true,
      answerJson: true,
      options: { select: { label: true }, orderBy: { sortOrder: 'asc' } }
    }
  });

  const riskSamples: RiskItem[] = [];
  const summary = {
    checked: questions.length,
    judge: {
      checked: 0,
      unusualOptionLabels: 0,
      incompatibleAnswerJson: 0
    },
    objective: {
      checked: 0,
      emptyOptions: 0,
      duplicateOptions: 0,
      answerOutsideOptions: 0,
      singleOrReadingMultipleAnswers: 0
    }
  };

  for (const question of questions) {
    const optionLabels = question.options.map((option) => option.label);
    const uniqueLabels = sortedUnique(optionLabels);

    if (question.type === 'judge') {
      summary.judge.checked += 1;
      const normalizedLabels = normalizeAllowedLabelsForQuestionType('judge', optionLabels);
      const normalizedLabelSet = new Set(normalizedLabels);
      if (
        optionLabels.length !== 2
        || normalizedLabelSet.size !== 2
        || !normalizedLabelSet.has('A')
        || !normalizedLabelSet.has('B')
      ) {
        summary.judge.unusualOptionLabels += 1;
        addSample(riskSamples, {
          questionId: question.id,
          type: question.type,
          reason: 'judge_unusual_option_labels',
          detail: { optionLabels, normalizedLabels }
        });
      }

      const normalizedAnswer = normalizeAnswerForObjectiveType('judge', question.answerJson);
      if (normalizedAnswer.length !== 1 || !['A', 'B'].includes(normalizedAnswer[0])) {
        summary.judge.incompatibleAnswerJson += 1;
        addSample(riskSamples, {
          questionId: question.id,
          type: question.type,
          reason: 'judge_incompatible_answer_json',
          detail: { answerJson: compact(question.answerJson), normalizedAnswer }
        });
      }
      continue;
    }

    summary.objective.checked += 1;
    if (!optionLabels.length) {
      summary.objective.emptyOptions += 1;
      addSample(riskSamples, {
        questionId: question.id,
        type: question.type,
        reason: 'empty_options',
        detail: { answerJson: compact(question.answerJson) }
      });
    }
    if (uniqueLabels.length !== optionLabels.length) {
      summary.objective.duplicateOptions += 1;
      addSample(riskSamples, {
        questionId: question.id,
        type: question.type,
        reason: 'duplicate_option_labels',
        detail: { optionLabels }
      });
    }

    const invalidAnswers = answerInvalidItems(question.type, question.answerJson, optionLabels);
    if (invalidAnswers.length) {
      summary.objective.answerOutsideOptions += 1;
      addSample(riskSamples, {
        questionId: question.id,
        type: question.type,
        reason: 'answer_outside_options',
        detail: {
          answerJson: compact(question.answerJson),
          normalizedAnswer: normalizeAnswerForObjectiveType(question.type, question.answerJson),
          optionLabels,
          invalidAnswers
        }
      });
    }

    const normalizedAnswer = normalizeAnswerForObjectiveType(question.type, question.answerJson);
    if (['single', 'reading'].includes(question.type) && normalizedAnswer.length > 1) {
      summary.objective.singleOrReadingMultipleAnswers += 1;
      addSample(riskSamples, {
        questionId: question.id,
        type: question.type,
        reason: 'single_or_reading_multiple_answers',
        detail: { answerJson: compact(question.answerJson), normalizedAnswer }
      });
    }
  }

  return { summary, riskSamples };
}

async function failedQueueSamples() {
  const [queueItems, sessionItems] = await Promise.all([
    prisma.practiceAnswerQueueItem.findMany({
      where: { status: 'failed' },
      take: FAILED_QUEUE_SAMPLE_LIMIT,
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        lastError: true,
        selectedJson: true,
        question: {
          select: {
            id: true,
            type: true,
            answerJson: true,
            options: { select: { label: true }, orderBy: { sortOrder: 'asc' } }
          }
        }
      }
    }),
    prisma.practiceAnswerSubmissionQueue.findMany({
      where: { status: 'failed' },
      take: FAILED_QUEUE_SAMPLE_LIMIT,
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        lastError: true,
        answersJson: true
      }
    })
  ]);

  const errorCounts: Record<string, number> = {};
  const samples: RiskItem[] = [];
  const bump = (message: string | null) => {
    const key = classifyError(message);
    errorCounts[key] = (errorCounts[key] || 0) + 1;
  };

  for (const item of queueItems) {
    bump(item.lastError);
    const question = item.question;
    const optionLabels = question.options.map((option) => option.label);
    const selectedForStorage = normalizeSelectedForPracticeStorage(question.type, item.selectedJson);
    const invalidItems = isObjectiveQuestionType(question.type)
      ? selectedInvalidItems(question.type, item.selectedJson, optionLabels)
      : [];
    addSample(samples, {
      queueId: item.id,
      questionId: question.id,
      type: question.type,
      reason: 'failed_practice_answer_queue_item',
      detail: {
        lastError: item.lastError,
        selected: compact(item.selectedJson),
        selectedForStorage,
        optionLabels,
        answerJson: compact(question.answerJson),
        invalidItems
      }
    });
  }

  const sessionQuestionIds = new Set<string>();
  const normalizedSessionAnswers = sessionItems.map((item) => {
    bump(item.lastError);
    const answers = Array.isArray(item.answersJson) ? item.answersJson : [];
    for (const answer of answers) {
      if (answer && typeof answer === 'object') {
        const questionId = String((answer as { questionId?: unknown }).questionId || '').trim();
        if (questionId) sessionQuestionIds.add(questionId);
      }
    }
    return { item, answers };
  });

  const questions = sessionQuestionIds.size
    ? await prisma.question.findMany({
      where: { id: { in: [...sessionQuestionIds] } },
      select: {
        id: true,
        type: true,
        answerJson: true,
        options: { select: { label: true }, orderBy: { sortOrder: 'asc' } }
      }
    })
    : [];
  const questionById = new Map(questions.map((question) => [question.id, question]));

  for (const { item, answers } of normalizedSessionAnswers) {
    for (const answer of answers.slice(0, 5)) {
      if (!answer || typeof answer !== 'object') continue;
      const raw = answer as { questionId?: unknown; selected?: unknown; clientAnswerId?: unknown };
      const questionId = String(raw.questionId || '').trim();
      const question = questionById.get(questionId);
      const optionLabels = question?.options.map((option) => option.label) || [];
      const type = question?.type || 'unknown';
      const selectedForStorage = question ? normalizeSelectedForPracticeStorage(type, raw.selected) : normalizeRawAnswerInput(raw.selected);
      const invalidItems = question && isObjectiveQuestionType(type)
        ? selectedInvalidItems(type, raw.selected, optionLabels)
        : [];
      addSample(samples, {
        queueId: item.id,
        questionId,
        type,
        reason: 'failed_practice_answer_submission_queue',
        detail: {
          lastError: item.lastError,
          clientAnswerId: raw.clientAnswerId,
          selected: compact(raw.selected),
          selectedForStorage,
          optionLabels,
          answerJson: compact(question?.answerJson),
          invalidItems
        }
      });
    }
  }

  return {
    summary: {
      failedPracticeAnswerQueueItems: queueItems.length,
      failedPracticeAnswerSubmissionQueues: sessionItems.length,
      errorCounts
    },
    samples
  };
}

async function main() {
  const [questionAudit, queueAudit] = await Promise.all([
    auditQuestions(),
    failedQueueSamples()
  ]);

  console.log(JSON.stringify({
    checkedAt: new Date().toISOString(),
    readonly: true,
    questions: questionAudit.summary,
    failedQueues: queueAudit.summary,
    riskSamples: questionAudit.riskSamples,
    failedQueueSamples: queueAudit.samples
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
