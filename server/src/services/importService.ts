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
  passageId?: string;
  readingPassage?: string;
  readingQuestion?: string;
  options?: Array<{ key?: string; keyLabel?: string; text?: string; label?: string; content?: string; value?: string }>;
  choices?: Array<{ key?: string; keyLabel?: string; text?: string; label?: string; content?: string; value?: string }>;
  answer?: unknown;
  answers?: unknown;
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
  if (['single', 'multiple', 'judge', 'fill', 'python', 'reading'].includes(value)) return value;
  if (value.includes('multi') || value.includes('多')) return 'multiple';
  if (value.includes('judge') || value.includes('true') || value.includes('判断')) return 'judge';
  if (value.includes('fill') || value.includes('blank') || value.includes('填空') || value.includes('词汇') || value.includes('单词') || value.includes('vocab')) return 'fill';
  if (value.includes('python') || value.includes('代码') || value.includes('编程')) return 'python';
  if (value.includes('reading') || value.includes('comprehension') || value.includes('阅读')) return 'reading';
  return 'single';
}

function normalizeAnswer(answer: unknown): string[] {
  if (Array.isArray(answer)) return answer.map(String).map((item) => item.trim()).filter(Boolean);
  if (answer === null || answer === undefined) return [];
  return [String(answer).trim()].filter(Boolean);
}

function hasOwnField(value: unknown, field: string) {
  return Boolean(value && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, field));
}

function fillImportError(question: LegacyQuestion, sortOrder: number, message: string) {
  const title = getStem(question).replace(/\s+/g, ' ').slice(0, 40);
  return new Error(`第 ${sortOrder + 1} 题「${title}」：${message}`);
}

function assertStandardFillImport(question: LegacyQuestion, sortOrder: number) {
  const forbiddenTopFields = ['answer', 'answers', 'correctAnswer', 'pronunciation'];
  const usedTopField = forbiddenTopFields.find((field) => hasOwnField(question, field));
  if (usedTopField) {
    throw fillImportError(question, sortOrder, `填空题导入格式已统一：不要使用顶层 ${usedTopField}，请使用 blanks: [{ "label": "1", "answer": ["答案"], "pronunciation": { "text": "答案", "lang": "en-US" } }]。`);
  }

  if (!Array.isArray(question.blanks) || question.blanks.length === 0) {
    throw fillImportError(question, sortOrder, '填空题必须提供 blanks 数组；单空题也写成 blanks 里 1 个空。');
  }

  question.blanks.forEach((blank, index) => {
    if (hasOwnField(blank, 'answers') || hasOwnField(blank, 'correctAnswer')) {
      throw fillImportError(question, sortOrder, `第 ${index + 1} 个 blank 只能使用 answer 字段，不再支持 answers 或 correctAnswer。`);
    }
    if (!Array.isArray(blank.answer)) {
      throw fillImportError(question, sortOrder, `第 ${index + 1} 个 blank 的 answer 必须是非空数组，例如 "answer": ["dilemma"]。`);
    }
    if (normalizeAnswer(blank.answer).length === 0) {
      throw fillImportError(question, sortOrder, `第 ${index + 1} 个 blank 的 answer 不能为空。`);
    }
  });
}

function normalizeFillBlanks(question: LegacyQuestion, sortOrder: number) {
  assertStandardFillImport(question, sortOrder);
  return question.blanks!.map((blank, index) => ({
    id: String(blank.id || `blank-${index + 1}`),
    label: String(blank.label || index + 1),
    prompt: blank.prompt ? String(blank.prompt) : '',
    answer: normalizeAnswer(blank.answer),
    ...(blank.pronunciation ? { pronunciation: blank.pronunciation } : {})
  }));
}

function normalizeFillAnswerFromBlanks(blanks: Array<{ answer: string[] }>) {
  if (blanks.length > 1) return blanks.map((blank) => blank.answer);
  return blanks[0].answer;
}

function normalizedFillRawQuestion(question: LegacyQuestion, blanks: ReturnType<typeof normalizeFillBlanks>) {
  const {
    answer: _answer,
    answers: _answers,
    correctAnswer: _correctAnswer,
    pronunciation: _pronunciation,
    ...rest
  } = question;
  return { ...rest, type: 'fill', blanks };
}

function readingImportError(question: LegacyQuestion, sortOrder: number, message: string) {
  const title = getStem(question).replace(/\s+/g, ' ').slice(0, 40);
  return new Error(`第 ${sortOrder + 1} 题「${title}」：${message}`);
}

function normalizeReadingPassage(question: LegacyQuestion) {
  return String(question.readingPassage ?? '').trim();
}

function normalizeReadingQuestionText(question: LegacyQuestion) {
  return String(question.readingQuestion ?? '').trim();
}

function normalizeReadingPassageId(question: LegacyQuestion) {
  return String(question.passageId ?? '').trim();
}

function assertNoReadingAliasFields(question: LegacyQuestion, sortOrder: number) {
  const aliasRules = [
    ['stem', 'question'],
    ['title', 'question'],
    ['content', 'question'],
    ['passage', 'readingPassage'],
    ['article', 'readingPassage'],
    ['subQuestion', 'readingQuestion'],
    ['prompt', 'readingQuestion'],
    ['choices', 'options'],
    ['answers', 'answer'],
    ['correctAnswer', 'answer']
  ];
  const usedAlias = aliasRules.find(([alias]) => hasOwnField(question, alias));
  if (usedAlias) {
    throw readingImportError(question, sortOrder, `阅读理解 JSON 标准已统一：不要使用 ${usedAlias[0]}，请使用 ${usedAlias[1]}。`);
  }
}

function assertStandardReadingOptions(question: LegacyQuestion, sortOrder: number) {
  if (!Array.isArray(question.options) || question.options.length < 2) {
    throw readingImportError(question, sortOrder, '阅读理解题必须提供 options 数组，且至少 2 个选项。');
  }

  question.options.forEach((option, index) => {
    const label = `第 ${index + 1} 个选项`;
    if (hasOwnField(option, 'keyLabel') || hasOwnField(option, 'label') || hasOwnField(option, 'content') || hasOwnField(option, 'value')) {
      throw readingImportError(question, sortOrder, `${label}必须使用 { "key": "A", "text": "..." }，不要使用 keyLabel/label/content/value。`);
    }
    if (typeof option.key !== 'string' || !option.key.trim()) {
      throw readingImportError(question, sortOrder, `${label}缺少 key。`);
    }
    if (typeof option.text !== 'string' || !option.text.trim()) {
      throw readingImportError(question, sortOrder, `${label}缺少 text。`);
    }
  });
}

function assertReadingImport(
  question: LegacyQuestion,
  sortOrder: number,
  answer: string[],
  options: Array<{ label: string; content: string }>
) {
  assertNoReadingAliasFields(question, sortOrder);
  if (question.type !== 'reading') {
    throw readingImportError(question, sortOrder, '阅读理解题 type 必须固定为 "reading"。');
  }
  if (!hasOwnField(question, 'question') || !String(question.question || '').trim()) {
    throw readingImportError(question, sortOrder, '阅读理解题必须使用 question 作为大题题干。');
  }
  if (!normalizeReadingPassageId(question)) {
    throw readingImportError(question, sortOrder, '阅读理解题必须提供 passageId，同一篇短文下的小题使用同一个 passageId。');
  }
  if (!normalizeReadingPassage(question)) {
    throw readingImportError(question, sortOrder, '阅读理解题必须提供 readingPassage。');
  }
  if (!normalizeReadingQuestionText(question)) {
    throw readingImportError(question, sortOrder, '阅读理解题必须提供 readingQuestion。');
  }
  assertStandardReadingOptions(question, sortOrder);
  if (!hasOwnField(question, 'answer') || typeof question.answer !== 'string') {
    throw readingImportError(question, sortOrder, '阅读理解题必须使用字符串 answer，例如 "D"。');
  }
  if (options.length < 2) {
    throw readingImportError(question, sortOrder, '阅读理解题至少需要 2 个选项。');
  }
  if (answer.length !== 1) {
    throw readingImportError(question, sortOrder, '阅读理解题只能设置 1 个正确答案。');
  }
  if (!options.some((option) => option.label === answer[0])) {
    throw readingImportError(question, sortOrder, `正确答案 ${answer[0]} 没有对应选项。`);
  }
}

export function assertStandardReadingQuestionImport(questionInput: unknown, sortOrder = 0) {
  const question = questionInput as LegacyQuestion;
  const answer = normalizeAnswer(question.answer);
  const rawOptions = Array.isArray(question.options) ? question.options : [];
  const options = rawOptions.map((option, index) => ({
    label: String(option.key || option.keyLabel || option.label || String.fromCharCode(65 + index)).trim(),
    content: String(option.text ?? option.content ?? option.value ?? '')
  }));
  assertReadingImport(question, sortOrder, answer, options);
}

function normalizedReadingRawQuestion(
  question: LegacyQuestion,
  answer: string[],
  options: Array<{ label: string; content: string }>
) {
  return {
    ...question,
    type: 'reading',
    typeLabel: question.typeLabel || '阅读理解',
    passageId: normalizeReadingPassageId(question),
    readingPassage: normalizeReadingPassage(question),
    readingQuestion: normalizeReadingQuestionText(question),
    options: options.map((option) => ({ key: option.label, text: option.content })),
    answer: answer[0] || ''
  };
}

function assertReadingFieldsHaveReadingType(question: LegacyQuestion, sortOrder: number, type: string) {
  if (type === 'reading') return;
  const readingFields = ['passageId', 'readingPassage', 'readingQuestion', 'passage', 'article', 'subQuestion', 'prompt'];
  const usedField = readingFields.find((field) => hasOwnField(question, field));
  if (usedField) {
    throw readingImportError(question, sortOrder, `检测到 ${usedField}，阅读理解题 type 必须固定为 "reading"。`);
  }
}

function getStem(question: LegacyQuestion) {
  return question.question || question.stem || question.title || question.content || '未命名题目';
}

async function upsertQuestion(bankId: string, question: LegacyQuestion, sortOrder: number): Promise<QuestionImportStatus> {
  const type = normalizeType(question.type);
  assertReadingFieldsHaveReadingType(question, sortOrder, type);
  const fillBlanks = type === 'fill' ? normalizeFillBlanks(question, sortOrder) : [];
  const answer = type === 'judge'
    ? normalizeJudgeAnswerArray(question.answer ?? question.correctAnswer)
    : type === 'fill'
      ? normalizeFillAnswerFromBlanks(fillBlanks)
      : normalizeAnswer(question.answer ?? question.correctAnswer);
  const optionAnswerLabels = Array.isArray(answer) ? answer.filter((item): item is string => typeof item === 'string') : [];
  const stem = getStem(question);
  const rawOptions = Array.isArray(question.options) ? question.options : (Array.isArray(question.choices) ? question.choices : []);
  const options = type === 'judge' ? normalizeJudgeOptionsForStorage() : rawOptions.map((option, index) => ({
    label: String(option.key || option.keyLabel || option.label || String.fromCharCode(65 + index)).trim(),
    content: String(option.text ?? option.content ?? option.value ?? '')
  }));
  if (type === 'reading') assertReadingImport(question, sortOrder, optionAnswerLabels, options);
  const normalizedRawQuestion = type === 'judge'
    ? { ...question, type: 'judge', options: [{ key: 'A', keyLabel: 'A', text: '正确' }, { key: 'B', keyLabel: 'B', text: '错误' }], answer }
    : type === 'fill'
      ? normalizedFillRawQuestion(question, fillBlanks)
      : type === 'reading'
        ? normalizedReadingRawQuestion(question, optionAnswerLabels, options)
        : question;

  const data = {
    bankId,
    legacyId: question.id || null,
    type,
    typeLabel: question.typeLabel || (type === 'reading' ? '阅读理解' : null),
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
