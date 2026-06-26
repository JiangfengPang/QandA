import fs from 'node:fs/promises';
import path from 'node:path';
import { prisma } from '../db/prisma.js';
import { normalizeJudgeAnswerArray, normalizeJudgeOptionsForStorage } from '../utils/judge.js';

type LegacySubject = {
  id?: string;
  name: string;
  description?: string;
  color?: string;
  file?: string;
  units?: LegacyUnit[];
};

type LegacyUnit = {
  id?: string;
  name: string;
  description?: string;
  file?: string;
  questionCount?: number;
};

type LegacyBankJson = {
  version?: number;
  source?: string;
  subject?: LegacySubject;
  unit?: LegacyUnit;
  questions?: LegacyQuestion[];
};

type LegacyQuestion = {
  id?: string;
  type?: string;
  typeLabel?: string;
  difficulty?: string;
  tags?: string[];
  score?: number;
  question?: string;
  stem?: string;
  title?: string;
  content?: string;
  options?: Array<{ key?: string; keyLabel?: string; text?: string; label?: string; content?: string; value?: string }>;
  choices?: Array<{ key?: string; keyLabel?: string; text?: string; label?: string; content?: string; value?: string }>;
  answer?: unknown;
  correctAnswer?: unknown;
  pronunciation?: unknown;
  blanks?: Array<{ id?: string; label?: string; prompt?: string; answer?: unknown; answers?: unknown; correctAnswer?: unknown; pronunciation?: unknown }>;
  explanation?: string;
  analysis?: string;
};

type ImportTarget = {
  subjectId?: string;
  bankId?: string;
};

type QuestionImportStatus = 'created' | 'updated';

function encodeLegacyFileName(fileName: string) {
  return Array.from(fileName).map((char) => {
    if (/^[A-Za-z0-9._-]$/.test(char)) return char;
    const code = char.codePointAt(0)?.toString(16) || '';
    return `#U${code.padStart(4, '0')}`;
  }).join('');
}

async function readJsonFile<T>(dir: string, fileName: string): Promise<T> {
  const candidates = [path.join(dir, fileName), path.join(dir, encodeLegacyFileName(fileName))];
  for (const candidate of candidates) {
    try {
      const content = await fs.readFile(candidate, 'utf-8');
      return JSON.parse(content) as T;
    } catch {}
  }
  throw new Error(`找不到题库文件：${fileName}`);
}

function normalizeType(type?: string) {
  const value = (type || 'single').toLowerCase();
  if (['single', 'multiple', 'judge', 'fill', 'python'].includes(value)) return value;
  if (value.includes('multi') || value.includes('多')) return 'multiple';
  if (value.includes('judge') || value.includes('true') || value.includes('判断')) return 'judge';
  if (value.includes('fill') || value.includes('blank') || value.includes('填空') || value.includes('词汇') || value.includes('单词') || value.includes('vocab')) return 'fill';
  if (value.includes('python') || value.includes('代码') || value.includes('编程')) return 'python';
  return 'single';
}

function normalizeAnswer(answer: unknown): string[] {
  if (Array.isArray(answer)) return answer.map(String).map((item) => item.trim()).filter(Boolean);
  if (answer === null || answer === undefined) return [];
  return [String(answer).trim()].filter(Boolean);
}

function normalizeAnswerGroups(answer: unknown): string[][] {
  if (!Array.isArray(answer) || !answer.some((item) => Array.isArray(item))) return [];
  return answer
    .map((item) => normalizeAnswer(item))
    .filter((group) => group.length > 0);
}

function normalizeFillBlanks(question: LegacyQuestion) {
  if (Array.isArray(question.blanks)) {
    return question.blanks
      .map((blank, index) => {
        const answer = normalizeAnswer(blank.answer ?? blank.answers ?? blank.correctAnswer);
        return {
          id: String(blank.id || `blank-${index + 1}`),
          label: String(blank.label || index + 1),
          prompt: blank.prompt ? String(blank.prompt) : '',
          answer,
          ...(blank.pronunciation ? { pronunciation: blank.pronunciation } : {})
        };
      })
      .filter((blank) => blank.answer.length > 0);
  }

  return normalizeAnswerGroups(question.answer ?? question.correctAnswer).map((answer, index) => ({
    id: `blank-${index + 1}`,
    label: String(index + 1),
    prompt: '',
    answer
  }));
}

function normalizeFillAnswer(question: LegacyQuestion) {
  const blanks = normalizeFillBlanks(question);
  if (blanks.length > 1) return blanks.map((blank) => blank.answer);
  if (blanks.length === 1) return blanks[0].answer;
  return normalizeAnswer(question.answer ?? question.correctAnswer);
}

function getStem(question: LegacyQuestion) {
  return question.question || question.stem || question.title || question.content || '未命名题目';
}

async function upsertQuestion(bankId: string, question: LegacyQuestion, sortOrder: number): Promise<QuestionImportStatus> {
  const type = normalizeType(question.type);
  const fillBlanks = type === 'fill' ? normalizeFillBlanks(question) : [];
  const answer = type === 'judge'
    ? normalizeJudgeAnswerArray(question.answer ?? question.correctAnswer)
    : type === 'fill'
      ? normalizeFillAnswer(question)
      : normalizeAnswer(question.answer ?? question.correctAnswer);
  const stem = getStem(question);
  const normalizedRawQuestion = type === 'judge'
    ? { ...question, type: 'judge', options: [{ key: 'A', keyLabel: 'A', text: '正确' }, { key: 'B', keyLabel: 'B', text: '错误' }], answer }
    : type === 'fill'
      ? { ...question, type: 'fill', answer, ...(fillBlanks.length ? { blanks: fillBlanks } : {}) }
      : question;

  const data = {
    bankId,
    legacyId: question.id || null,
    type,
    typeLabel: question.typeLabel || null,
    difficulty: question.difficulty || null,
    score: Number(question.score || 0),
    stem,
    answerJson: answer,
    tagsJson: Array.isArray(question.tags) ? question.tags : [],
    explanation: question.explanation || question.analysis || null,
    rawJson: normalizedRawQuestion as any,
    sortOrder,
    isActive: true
  };

  const rawOptions = Array.isArray(question.options) ? question.options : (Array.isArray(question.choices) ? question.choices : []);
  const options = type === 'judge' ? normalizeJudgeOptionsForStorage() : rawOptions.map((option, index) => ({
    label: String(option.key || option.keyLabel || option.label || String.fromCharCode(65 + index)).trim(),
    content: String(option.text ?? option.content ?? option.value ?? '')
  }));
  const optionAnswerLabels = Array.isArray(answer) ? answer.filter((item): item is string => typeof item === 'string') : [];

  return prisma.$transaction(async (tx) => {
    const existing = question.id
      ? await tx.question.findFirst({ where: { bankId, legacyId: question.id } })
      : await tx.question.findFirst({ where: { bankId, stem } });
    const saved = existing
      ? await tx.question.update({ where: { id: existing.id }, data })
      : await tx.question.create({ data });

    await tx.questionOption.deleteMany({ where: { questionId: saved.id } });
    if (options.length) {
      await tx.questionOption.createMany({
        data: options.map((option, index) => ({
          questionId: saved.id,
          label: option.label,
          content: option.content,
          isCorrect: optionAnswerLabels.includes(option.label),
          sortOrder: index
        }))
      });
    }

    return existing ? 'updated' : 'created';
  });
}

function normalizeImportJson(input: unknown): LegacyBankJson {
  const body = input as any;
  if (Array.isArray(body)) return { questions: body };
  if (body && typeof body === 'object') {
    if (Array.isArray(body.questions)) return body as LegacyBankJson;
    if (Array.isArray(body.data?.questions)) return body.data as LegacyBankJson;
    if (body.question || body.stem || body.title) return { questions: [body] };
  }
  throw new Error('无法识别 JSON 格式：需要完整 QandA JSON、questions 数组或单道题对象');
}

async function resolveSubject(bankJson: LegacyBankJson, target?: ImportTarget) {
  if (target?.subjectId) {
    const subject = await prisma.subject.findUnique({ where: { id: target.subjectId } });
    if (subject) return subject;
  }

  if (!bankJson.subject?.name) throw new Error('JSON 缺少 subject.name。也可以先在左侧选择目标科目再导入。');

  const legacyId = bankJson.subject.id || null;
  const byLegacy = legacyId ? await prisma.subject.findUnique({ where: { legacyId } }) : null;
  if (byLegacy) {
    return prisma.subject.update({
      where: { id: byLegacy.id },
      data: {
        name: bankJson.subject.name,
        description: bankJson.subject.description || byLegacy.description || '',
        color: bankJson.subject.color || byLegacy.color || '#5b8def',
        isActive: true
      }
    });
  }

  const byName = await prisma.subject.findFirst({ where: { name: bankJson.subject.name } });
  if (byName) {
    return prisma.subject.update({
      where: { id: byName.id },
      data: {
        description: bankJson.subject.description ?? byName.description,
        color: bankJson.subject.color || byName.color || '#5b8def',
        isActive: true,
        ...(legacyId && !byName.legacyId ? { legacyId } : {})
      }
    });
  }

  return prisma.subject.create({
    data: {
      legacyId,
      name: bankJson.subject.name,
      description: bankJson.subject.description || '',
      color: bankJson.subject.color || '#5b8def',
      isActive: true
    }
  });
}


async function getNextBankSortOrder(subjectId: string) {
  const result = await prisma.bank.aggregate({
    where: { subjectId },
    _max: { sortOrder: true }
  });
  return (result._max.sortOrder ?? -1) + 1;
}

async function resolveBank(subjectId: string, bankJson: LegacyBankJson, target?: ImportTarget) {
  if (target?.bankId) {
    const bank = await prisma.bank.findFirst({ where: { id: target.bankId, subjectId } });
    if (bank) return bank;
  }

  if (!bankJson.unit?.name) throw new Error('JSON 缺少 unit.name。也可以先在左侧选择目标题库再导入。');

  const legacyId = bankJson.unit.id || null;
  const byLegacy = legacyId ? await prisma.bank.findFirst({ where: { subjectId, legacyId } }) : null;
  if (byLegacy) {
    return prisma.bank.update({
      where: { id: byLegacy.id },
      data: { name: bankJson.unit.name, description: bankJson.unit.description || byLegacy.description || '', isActive: true }
    });
  }

  const byName = await prisma.bank.findFirst({ where: { subjectId, name: bankJson.unit.name } });
  if (byName) {
    return prisma.bank.update({
      where: { id: byName.id },
      data: {
        description: bankJson.unit.description ?? byName.description,
        isActive: true,
        ...(legacyId && !byName.legacyId ? { legacyId } : {})
      }
    });
  }

  const sortOrder = await getNextBankSortOrder(subjectId);
  return prisma.bank.create({
    data: {
      subjectId,
      legacyId,
      name: bankJson.unit.name,
      description: bankJson.unit.description || '',
      sortOrder,
      isActive: true
    }
  });
}

export async function importLegacyBankJson(input: LegacyBankJson | unknown, target?: ImportTarget) {
  const bankJson = normalizeImportJson(input);
  if (!Array.isArray(bankJson.questions)) throw new Error('JSON 缺少 questions 数组');
  if (bankJson.questions.length === 0) throw new Error('questions 数组为空，没有可导入题目');

  const subject = await resolveSubject(bankJson, target);
  const bank = await resolveBank(subject.id, bankJson, target);

  let createdCount = 0;
  let updatedCount = 0;
  for (let index = 0; index < bankJson.questions.length; index += 1) {
    const status = await upsertQuestion(bank.id, bankJson.questions[index], index);
    if (status === 'created') createdCount += 1;
    else updatedCount += 1;
  }

  return {
    subject,
    bank,
    questionCount: bankJson.questions.length,
    createdCount,
    updatedCount
  };
}

export async function importLegacyDirectory(dir: string) {
  const index = await readJsonFile<{ subjects: LegacySubject[] }>(dir, 'index.json');
  let subjectCount = 0;
  let bankCount = 0;
  let questionCount = 0;

  for (let sIndex = 0; sIndex < (index.subjects || []).length; sIndex += 1) {
    const item = index.subjects[sIndex];
    const subject = await prisma.subject.upsert({
      where: { legacyId: item.id || `subject-${item.name}` },
      update: { name: item.name, description: item.description || '', color: item.color || '#5b8def', sortOrder: sIndex, isActive: true },
      create: { legacyId: item.id || `subject-${item.name}`, name: item.name, description: item.description || '', color: item.color || '#5b8def', sortOrder: sIndex, isActive: true }
    });
    subjectCount += 1;

    for (let uIndex = 0; uIndex < (item.units || []).length; uIndex += 1) {
      const unit = item.units![uIndex];
      if (!unit.file) continue;
      const bankJson = await readJsonFile<LegacyBankJson>(dir, unit.file);
      bankJson.subject = bankJson.subject || item;
      bankJson.unit = bankJson.unit || unit;
      const result = await importLegacyBankJson(bankJson);
      await prisma.bank.update({ where: { id: result.bank.id }, data: { sortOrder: uIndex, sourceFile: unit.file } });
      bankCount += 1;
      questionCount += result.questionCount;
    }
  }

  return { subjectCount, bankCount, questionCount };
}
