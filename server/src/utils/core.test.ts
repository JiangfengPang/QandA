import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import type { NextFunction, Request, Response } from 'express';
import { isAnswerCorrect, isFillAnswerCorrect, normalizeAnswer, normalizeFillAnswerGroups } from './answer.js';
import { asyncHandler } from './asyncHandler.js';
import { isSupportedImageBuffer } from '../services/avatarStorage.js';
import { clientIp } from '../middleware/rateLimit.js';
import { createVerificationCode } from './verificationCode.js';
import { assertAllowedNickname, hasForbiddenNickname, normalizeNickname } from './nicknamePolicy.js';
import { buildActivityStatsFromDailyUserAggregates, buildDailyActivityTrend } from '../services/adminAnalyticsService.js';
import { assertStandardObjectiveQuestionImport, assertStandardReadingQuestionImport } from '../services/importService.js';
import {
  isPresenceSessionOnline,
  normalizePresenceSessionId,
  PRESENCE_ONLINE_WINDOW_MS
} from '../services/presenceService.js';
import { effectiveQuestionCount, summarizeBankProgress, summarizeEffectiveAnswers, summarizeLatestAnswers } from '../services/progressService.js';
import { formatQuestion } from '../services/questionService.js';
import {
  assertPracticeSelectedAnswerAllowed,
  normalizeSelectedForPracticeStorage
} from '../services/practiceRecordService.js';
import { dedupeSessionAnswers } from '../services/practiceAnswerQueueService.js';

test('answer comparison normalizes case, order and duplicates', () => {
  assert.deepEqual(normalizeAnswer([null, undefined, '']), []);
  assert.deepEqual(normalizeAnswer(['b', ' A ', 'a']), ['A', 'B']);
  assert.equal(isAnswerCorrect(['b', 'a'], ['A', 'B']), true);
  assert.equal(isAnswerCorrect(['A'], ['A', 'B']), false);
  assert.equal(isAnswerCorrect([' Adequately '], ['adequately']), true);
  assert.equal(isAnswerCorrect(['look upon ... as'], ['look upon … as']), true);
});

test('multiple choice comparison accepts compact answer strings in any order', () => {
  assert.deepEqual(normalizeAnswer(['ACD']), ['A', 'C', 'D']);
  assert.deepEqual(normalizeAnswer('CDA'), ['A', 'C', 'D']);
  assert.deepEqual(normalizeAnswer(['CDA']), ['A', 'C', 'D']);
  assert.deepEqual(normalizeAnswer('A,C,D'), ['A', 'C', 'D']);
  assert.deepEqual(normalizeAnswer('A、C、D'), ['A', 'C', 'D']);
  assert.deepEqual(normalizeAnswer('A C D'), ['A', 'C', 'D']);
  assert.deepEqual(normalizeAnswer(['c', 'd', 'a']), ['A', 'C', 'D']);
  assert.deepEqual(normalizeAnswer(['A', 'A', 'C']), ['A', 'C']);
  assert.equal(isAnswerCorrect(['C', 'D', 'A'], ['ACD']), true);
  assert.equal(isAnswerCorrect('CDA', ['A', 'C', 'D']), true);
  assert.equal(isAnswerCorrect(['B', 'D', 'A'], ['ABD']), true);
  assert.equal(isAnswerCorrect(['A', 'C'], ['ACD']), false);
});

test('practice answer submission normalizes compact objective selections before option validation', () => {
  const allowedLabels = ['A', 'B', 'C', 'D'];
  assert.deepEqual(normalizeSelectedForPracticeStorage('multiple', ['CDA']), ['A', 'C', 'D']);
  assert.deepEqual(normalizeSelectedForPracticeStorage('multiple', 'CDA'), ['A', 'C', 'D']);
  assert.deepEqual(normalizeSelectedForPracticeStorage('multiple', ['C', 'D', 'A']), ['A', 'C', 'D']);
  assert.doesNotThrow(() => {
    assertPracticeSelectedAnswerAllowed('multiple', normalizeSelectedForPracticeStorage('multiple', ['CDA']), allowedLabels);
  });
  assert.throws(
    () => assertPracticeSelectedAnswerAllowed('multiple', normalizeSelectedForPracticeStorage('multiple', ['A', 'E']), allowedLabels),
    /答案包含无效选项/
  );
});

test('practice answer submission keeps single reading judge and fill selection rules', () => {
  assert.throws(
    () => assertPracticeSelectedAnswerAllowed('single', ['A', 'C'], ['A', 'B', 'C']),
    /单选题只能选择一个答案/
  );
  assert.throws(
    () => assertPracticeSelectedAnswerAllowed('single', normalizeSelectedForPracticeStorage('single', 'AB'), ['A', 'B', 'C']),
    /单选题只能选择一个答案/
  );
  assert.throws(
    () => assertPracticeSelectedAnswerAllowed('reading', ['A', 'B'], ['A', 'B', 'C']),
    /单选题只能选择一个答案/
  );
  assert.throws(
    () => assertPracticeSelectedAnswerAllowed('reading', normalizeSelectedForPracticeStorage('reading', 'AB'), ['A', 'B', 'C']),
    /单选题只能选择一个答案/
  );
  assert.deepEqual(normalizeSelectedForPracticeStorage('judge', ['true']), ['A']);
  assert.deepEqual(normalizeSelectedForPracticeStorage('judge', ['错误']), ['B']);
  assert.deepEqual(normalizeSelectedForPracticeStorage('fill', ['CDA']), ['CDA']);
  assert.deepEqual(normalizeSelectedForPracticeStorage('fill', 'CDA'), ['CDA']);
});

test('practice judge answer validation normalizes option labels before comparing selections', () => {
  const trueFalseLabels = ['true', 'false'];
  assert.doesNotThrow(() => assertPracticeSelectedAnswerAllowed('judge', ['A'], trueFalseLabels));
  assert.doesNotThrow(() => assertPracticeSelectedAnswerAllowed('judge', ['B'], trueFalseLabels));
  assert.deepEqual(normalizeSelectedForPracticeStorage('judge', ['true']), ['A']);
  assert.doesNotThrow(() => {
    assertPracticeSelectedAnswerAllowed('judge', normalizeSelectedForPracticeStorage('judge', ['true']), trueFalseLabels);
  });
  assert.deepEqual(normalizeSelectedForPracticeStorage('judge', ['false']), ['B']);
  assert.doesNotThrow(() => {
    assertPracticeSelectedAnswerAllowed('judge', normalizeSelectedForPracticeStorage('judge', ['false']), trueFalseLabels);
  });
  assert.deepEqual(normalizeSelectedForPracticeStorage('judge', ['正确']), ['A']);
  assert.doesNotThrow(() => {
    assertPracticeSelectedAnswerAllowed('judge', normalizeSelectedForPracticeStorage('judge', ['正确']), trueFalseLabels);
  });
  assert.deepEqual(normalizeSelectedForPracticeStorage('judge', ['错误']), ['B']);
  assert.doesNotThrow(() => {
    assertPracticeSelectedAnswerAllowed('judge', normalizeSelectedForPracticeStorage('judge', ['错误']), trueFalseLabels);
  });
  assert.doesNotThrow(() => assertPracticeSelectedAnswerAllowed('judge', ['A'], ['A', 'B']));
  assert.doesNotThrow(() => assertPracticeSelectedAnswerAllowed('judge', ['B'], ['正确', '错误']));
  assert.doesNotThrow(() => assertPracticeSelectedAnswerAllowed('judge', ['A'], ['对', '错']));
  assert.doesNotThrow(() => assertPracticeSelectedAnswerAllowed('judge', ['A'], ['是', '否']));
  assert.throws(
    () => assertPracticeSelectedAnswerAllowed('judge', ['C'], trueFalseLabels),
    /答案包含无效选项/
  );
});

test('fill answer comparison accepts any configured answer variant', () => {
  assert.equal(isFillAnswerCorrect([' Colour '], ['color', 'colour']), true);
  assert.equal(isFillAnswerCorrect(['color'], ['color', 'colour']), true);
  assert.equal(isFillAnswerCorrect(['colours'], ['color', 'colour']), false);
  assert.equal(isAnswerCorrect(['color'], ['color', 'colour']), false);
  assert.equal(isFillAnswerCorrect(['CDA'], ['CDA']), true);
  assert.equal(isFillAnswerCorrect(['A、C、D'], ['A、C、D']), true);
});

test('practice queue preserves scalar selected values for service-level normalization', () => {
  assert.deepEqual(dedupeSessionAnswers('session-a', [{
    questionId: 'question-a',
    selected: 'CDA' as any,
    clientAnswerId: 'client-a',
    durationSeconds: 3
  }]), [{
    questionId: 'question-a',
    selected: ['CDA'],
    clientAnswerId: 'client-a',
    durationSeconds: 3
  }]);
});

test('direct and queued practice submissions use the same selected normalization before judging', () => {
  const directSelected = normalizeSelectedForPracticeStorage('multiple', 'CDA');
  const queuedSelected = dedupeSessionAnswers('session-a', [{
    questionId: 'question-a',
    selected: 'CDA' as any,
    clientAnswerId: 'client-a',
    durationSeconds: 3
  }])[0].selected;

  assert.deepEqual(normalizeSelectedForPracticeStorage('multiple', queuedSelected), directSelected);
  assert.equal(isAnswerCorrect(directSelected, ['A', 'C', 'D']), true);
  assert.equal(isAnswerCorrect(normalizeSelectedForPracticeStorage('multiple', queuedSelected), ['A', 'C', 'D']), true);
});

test('formatted judge questions normalize scalar historical answers and labels', () => {
  const formatted = formatQuestion({
    id: 'judge-true-false',
    bankId: 'bank-a',
    type: 'judge',
    typeLabel: '判断题',
    difficulty: 'easy',
    score: 1,
    stem: 'The statement is true.',
    answerJson: 'true',
    tagsJson: [],
    explanation: '',
    rawJson: {},
    options: [
      { id: 'opt-true', label: 'true', content: '正确' },
      { id: 'opt-false', label: 'false', content: '错误' }
    ],
    answers: [{ selectedJson: 'false', createdAt: new Date('2026-06-30T00:00:00.000Z') }]
  }) as any;

  assert.deepEqual(formatted.answer, ['A']);
  assert.deepEqual(formatted.userAnswer, ['B']);
  assert.equal(formatted.options[0].key, 'A');
  assert.equal(formatted.options[0].isCorrect, true);
  assert.equal(formatted.options[1].key, 'B');
  assert.equal(formatted.options[1].isCorrect, false);
});

test('multi blank fill comparison preserves blank order and per-blank variants', () => {
  const answer = [['aspiration'], ['aspirational', 'ambitious']];
  assert.deepEqual(normalizeFillAnswerGroups(answer), [['aspiration'], ['ambitious', 'aspirational']]);
  assert.equal(isFillAnswerCorrect([' aspiration ', 'Ambitious'], answer), true);
  assert.equal(isFillAnswerCorrect(['ambitious', 'aspiration'], answer), false);
  assert.equal(isFillAnswerCorrect(['aspiration'], answer), false);
  assert.equal(isFillAnswerCorrect(['aspiration', 'aspirational', 'extra'], answer), false);
});

test('formatted multi blank fill questions expose blank definitions and display answers', () => {
  const formatted = formatQuestion({
    id: 'q-multi-fill',
    bankId: 'bank-a',
    type: 'fill',
    typeLabel: '多空填空',
    difficulty: 'medium',
    score: 2,
    stem: 'The noun is ____, and the adjective form is ____.',
    answerJson: [['aspiration'], ['aspirational', 'ambitious']],
    tagsJson: [],
    explanation: '解析',
    rawJson: {
      blanks: [
        { label: '1', prompt: '名词', answer: ['aspiration'] },
        { label: '2', prompt: '形容词', answer: ['aspirational', 'ambitious'] }
      ]
    },
    options: []
  }) as any;

  assert.deepEqual(formatted.answer, ['aspiration', 'aspirational / ambitious']);
  assert.equal(formatted.fillBlanks.length, 2);
  assert.deepEqual(formatted.fillBlanks[1], {
    id: 'blank-2',
    label: '2',
    prompt: '形容词',
    answer: ['aspirational', 'ambitious'],
    pronunciation: undefined
  });
});

test('verification codes are six numeric digits', () => {
  for (let index = 0; index < 100; index += 1) {
    assert.match(createVerificationCode(), /^\d{6}$/);
  }
});

test('nickname policy normalizes and accepts meaningful nicknames', () => {
  assert.equal(normalizeNickname('  Ａ 同学  '), 'A 同学');
  assert.equal(assertAllowedNickname('学习者4821'), '学习者4821');
  assert.equal(hasForbiddenNickname('阅读理解演示'), false);
});

test('nickname policy rejects low quality and reserved nicknames', () => {
  assert.throws(() => assertAllowedNickname('。'), /不能只包含标点/);
  assert.throws(() => assertAllowedNickname('A'), /至少需要 2 个有效字符/);
  assert.throws(() => assertAllowedNickname('111111'), /连续重复字符/);
  assert.throws(() => assertAllowedNickname('管理员'), /保留词/);
  assert.throws(() => assertAllowedNickname('傻逼'), /不文明用语/);
  assert.equal(hasForbiddenNickname('...'), true);
});

test('avatar signatures must match the declared format', () => {
  assert.equal(isSupportedImageBuffer(Buffer.from([0xff, 0xd8, 0xff, 0x00]), 'jpg'), true);
  assert.equal(isSupportedImageBuffer(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), 'png'), true);
  assert.equal(isSupportedImageBuffer(Buffer.from('RIFF0000WEBP', 'ascii'), 'webp'), true);
  assert.equal(isSupportedImageBuffer(Buffer.from('<script>alert(1)</script>'), 'png'), false);
});

test('client IP uses Express trust-proxy resolution instead of raw forwarded headers', () => {
  const req = {
    ip: '203.0.113.8',
    headers: { 'x-forwarded-for': '198.51.100.20' },
    socket: { remoteAddress: '127.0.0.1' }
  } as unknown as Request;
  assert.equal(clientIp(req), '203.0.113.8');
});

test('async handler forwards rejected promises to Express error middleware', async () => {
  const expected = new Error('database unavailable');
  const forwarded = new Promise<unknown>((resolve) => {
    const next: NextFunction = (error?: unknown) => resolve(error);
    asyncHandler(async () => {
      throw expected;
    })({} as Request, {} as Response, next);
  });
  assert.equal(await forwarded, expected);
});

test('bank progress aggregation keeps only the latest answer per question', () => {
  const older = new Date('2026-06-01T08:00:00.000Z');
  const newer = new Date('2026-06-01T09:00:00.000Z');
  const result = summarizeBankProgress(
    ['bank-a', 'bank-b'],
    [
      { bankId: 'bank-a', questionId: 'q1', isCorrect: false, createdAt: older },
      { bankId: 'bank-a', questionId: 'q1', isCorrect: true, createdAt: newer },
      { bankId: 'bank-a', questionId: 'q2', isCorrect: false, createdAt: newer }
    ],
    [{ bankId: 'bank-a' }, { bankId: 'bank-a' }]
  );

  assert.deepEqual(
    {
      answerCount: result.get('bank-a')?.answerCount,
      correctCount: result.get('bank-a')?.correctCount,
      accuracy: result.get('bank-a')?.accuracy,
      wrongQuestionCount: result.get('bank-a')?.wrongQuestionCount
    },
    { answerCount: 2, correctCount: 1, accuracy: 50, wrongQuestionCount: 2 }
  );
  assert.equal(result.get('bank-b')?.answerCount, 0);
});

test('reading passage counts as one effective question group', () => {
  const answeredAt = new Date('2026-06-01T09:00:00.000Z');
  const questions = [
    { id: 'r1', bankId: 'bank-a', type: 'reading', stem: 'Read the passage.', rawJson: { passageId: 'passage-one', readingPassage: 'Passage One\nSame text.' } },
    { id: 'r2', bankId: 'bank-a', type: 'reading', stem: 'Read the passage.', rawJson: { passageId: 'passage-one', readingPassage: 'Passage One\nSame text with spacing noise.' } },
    { id: 'q1', bankId: 'bank-a', type: 'single', stem: 'A normal question.', rawJson: null }
  ];

  const summary = summarizeEffectiveAnswers(questions, [
    { questionId: 'r1', isCorrect: true, createdAt: answeredAt },
    { questionId: 'r2', isCorrect: true, createdAt: answeredAt },
    { questionId: 'q1', isCorrect: false, createdAt: answeredAt }
  ]);

  assert.equal(effectiveQuestionCount(questions), 2);
  assert.equal(summary.answerCount, 2);
  assert.equal(summary.correctCount, 1);
  assert.equal(summary.accuracy, 50);
});

test('reading JSON import accepts only the standard field names', () => {
  const standardReadingQuestion = {
    id: 'passage-one-q1',
    type: 'reading',
    question: 'Passage One. Read the passage and choose the best answer.',
    passageId: 'passage-one',
    readingPassage: 'Passage One\n\nNew research suggests pandas may be too comfortable.',
    readingQuestion: 'What do we learn from new research about pandas?',
    options: [
      { key: 'A', text: 'They are losing habitat.' },
      { key: 'B', text: 'They have stopped seeking new mates.' },
      { key: 'C', text: 'They may not adapt.' },
      { key: 'D', text: 'They may cease to exist because life is too good.' }
    ],
    answer: 'D',
    explanation: 'The opening sentence says this directly.'
  };

  assert.doesNotThrow(() => assertStandardReadingQuestionImport(standardReadingQuestion));
  assert.throws(
    () => assertStandardReadingQuestionImport({ ...standardReadingQuestion, passage: standardReadingQuestion.readingPassage }),
    /不要使用 passage，请使用 readingPassage/
  );
  assert.throws(
    () => assertStandardReadingQuestionImport({
      ...standardReadingQuestion,
      options: [
        { label: 'A', content: 'Old option shape.' },
        { label: 'B', content: 'Old option shape.' }
      ]
    }),
    /必须使用 \{ "key": "A", "text": "\.\.\." \}/
  );
});

test('objective JSON import requires canonical answer arrays and option fields', () => {
  const standardMultipleQuestion = {
    id: 'objective-multiple',
    type: 'multiple',
    question: 'Which options are correct?',
    options: [
      { key: 'A', text: 'Alpha' },
      { key: 'B', text: 'Beta' },
      { key: 'C', text: 'Gamma' },
      { key: 'D', text: 'Delta' }
    ],
    answer: ['A', 'C', 'D'],
    explanation: 'A, C and D are correct.'
  };

  assert.doesNotThrow(() => assertStandardObjectiveQuestionImport(standardMultipleQuestion));
  assert.throws(
    () => assertStandardObjectiveQuestionImport({ ...standardMultipleQuestion, answer: 'ACD' }),
    /必须使用 answer 数组/
  );
  assert.throws(
    () => assertStandardObjectiveQuestionImport({ ...standardMultipleQuestion, answer: ['ACD'] }),
    /每个答案项必须是一个独立选项标识/
  );
  assert.throws(
    () => assertStandardObjectiveQuestionImport({ ...standardMultipleQuestion, answer: ['C', 'A', 'D'] }),
    /必须按选项顺序填写/
  );
  assert.throws(
    () => assertStandardObjectiveQuestionImport({
      ...standardMultipleQuestion,
      choices: standardMultipleQuestion.options,
      options: undefined
    }),
    /不要使用 choices，请使用 options/
  );
  assert.throws(
    () => assertStandardObjectiveQuestionImport({
      ...standardMultipleQuestion,
      options: standardMultipleQuestion.options.map((option) => ({ label: option.key, content: option.text }))
    }),
    /必须使用 \{ "key": "A", "text": "\.\.\." \}/
  );
  assert.throws(
    () => assertStandardObjectiveQuestionImport({ ...standardMultipleQuestion, type: 'single', answer: ['A', 'C'] }),
    /单选题只能设置一个正确答案/
  );

  assert.doesNotThrow(() => assertStandardObjectiveQuestionImport({
    id: 'objective-judge',
    type: 'judge',
    question: 'This statement is true.',
    options: [
      { key: 'A', text: '正确' },
      { key: 'B', text: '错误' }
    ],
    answer: ['A']
  }));
});

test('admin generic question writes reject reading questions', () => {
  const route = readFileSync(new URL('../routes/admin.ts', import.meta.url), 'utf8');

  assert.match(route, /function rejectReadingQuestionWrite/);
  assert.match(route, /阅读理解请使用阅读短文与小题的统一保存入口/);
  assert.match(route, /rejectReadingQuestionWrite\(parsed\.type\)/);
  assert.match(route, /rejectReadingQuestionWrite\(current\.type\)/);
});

test('latest answer summary ignores duplicate historical records for the same question', () => {
  const older = new Date('2026-06-01T08:00:00.000Z');
  const newer = new Date('2026-06-01T09:00:00.000Z');
  const summary = summarizeLatestAnswers([
    { questionId: 'q1', isCorrect: false, createdAt: older },
    { questionId: 'q1', isCorrect: true, createdAt: newer },
    { questionId: 'q2', isCorrect: false, createdAt: newer }
  ]);

  assert.equal(summary.answerCount, 2);
  assert.equal(summary.correctCount, 1);
  assert.equal(summary.wrongCount, 1);
  assert.equal(summary.accuracy, 50);
});

test('practice answer idempotency keeps database and service safeguards', () => {
  const schema = readFileSync(new URL('../../prisma/schema.prisma', import.meta.url), 'utf8');
  const service = readFileSync(new URL('../services/practiceRecordService.ts', import.meta.url), 'utf8');

  assert.match(schema, /clientAnswerId\s+String\?\s+@db\.VarChar\(120\)/);
  assert.match(schema, /@@unique\(\[userId,\s*clientAnswerId\]\)/);
  assert.match(service, /userId_clientAnswerId:\s*\{\s*userId,\s*clientAnswerId:\s*safeClientAnswerId\s*\}/);
  assert.match(service, /code\?:\s*string\s*\}\)\.code === 'P2002'/);
});

test('favorite submission can set a desired state idempotently', () => {
  const route = readFileSync(new URL('../routes/practice.ts', import.meta.url), 'utf8');
  const service = readFileSync(new URL('../services/practiceRecordService.ts', import.meta.url), 'utf8');

  assert.match(route, /typeof req\.body\?\.favorite === 'boolean'/);
  assert.match(service, /desiredFavorite\?: boolean/);
  assert.match(service, /prisma\.userFavorite\.upsert/);
  assert.match(service, /prisma\.userFavorite\.deleteMany\(\{ where: \{ userId, questionId \} \}\)/);
});

test('practice answer queue is wired through schema, API and server worker', () => {
  const schema = readFileSync(new URL('../../prisma/schema.prisma', import.meta.url), 'utf8');
  const migration = readFileSync(new URL('../../prisma/migrations/20260629000300_add_practice_answer_queue/migration.sql', import.meta.url), 'utf8');
  const route = readFileSync(new URL('../routes/practice.ts', import.meta.url), 'utf8');
  const queueService = readFileSync(new URL('../services/practiceAnswerQueueService.ts', import.meta.url), 'utf8');
  const server = readFileSync(new URL('../server.ts', import.meta.url), 'utf8');
  const env = readFileSync(new URL('../config/env.ts', import.meta.url), 'utf8');

  assert.match(schema, /model PracticeAnswerQueueItem/);
  assert.match(schema, /@@unique\(\[userId,\s*clientAnswerId\]\)/);
  assert.match(migration, /CREATE TABLE `PracticeAnswerQueueItem`/);
  assert.match(route, /router\.post\('\/answers\/batch'/);
  assert.match(route, /enqueuePracticeAnswerSubmissions/);
  assert.match(route, /queueStatus/);
  assert.match(route, /canQueueClientEvaluatedAnswer/);
  assert.match(route, /submitPracticeAnswer\(req\.auth!\.userId,\s*input\.questionId/);
  assert.doesNotMatch(queueService, /isCorrect/);
  assert.doesNotMatch(queueService, /explanation/);
  assert.match(queueService, /submitPracticeAnswer/);
  assert.match(queueService, /answer queue worker started/);
  assert.match(queueService, /answer queue worker stats/);
  assert.match(queueService, /STATUS_RETRYING = 'retrying'/);
  assert.match(queueService, /status:\s*permanent \? STATUS_FAILED : STATUS_RETRYING/);
  assert.match(queueService, /practiceAnswerQueueConcurrency/);
  assert.match(queueService, /dedupeQueueInputs/);
  assert.match(queueService, /existingStatusByClientAnswerId/);
  assert.match(queueService, /duplicate:\$\{existingStatusByClientAnswerId\.get\(row\.clientAnswerId\)\}/);
  assert.match(env, /PRACTICE_ANSWER_QUEUE_STATS_LOG_INTERVAL_MS/);
  assert.match(env, /PRACTICE_ANSWER_QUEUE_STRICT_INTERVAL/);
  assert.match(env, /PRACTICE_ANSWER_QUEUE_MAX_DRAIN_ROUNDS/);
  assert.doesNotMatch(queueService, /STATUS_DEAD/);
  assert.match(server, /startPracticeAnswerQueueWorker\(\)/);
});

test('practice answer queue worker consumes successfully and retries failed jobs', () => {
  const queueService = readFileSync(new URL('../services/practiceAnswerQueueService.ts', import.meta.url), 'utf8');

  assert.match(queueService, /await submitPracticeAnswer\(/);
  assert.match(queueService, /await markQueueItemProcessed\(item\.id\)/);
  assert.match(queueService, /return 'processed' as const/);
  assert.match(queueService, /await markQueueItemFailed\(item,\s*error\)/);
  assert.match(queueService, /return 'failed' as const/);
  assert.match(queueService, /retryDelayMs\(nextRetryCount\)/);
  assert.match(queueService, /nextRetryCount >= env\.practiceAnswerQueueMaxAttempts/);
  assert.match(queueService, /practiceAnswerQueueStrictInterval/);
  assert.match(queueService, /practiceAnswerQueueMaxDrainRounds/);
  assert.match(queueService, /processedSinceLastLog/);
});

test('practice answer queue exposes admin monitoring and safe processed cleanup', () => {
  const adminRoute = readFileSync(new URL('../routes/admin.ts', import.meta.url), 'utf8');
  const queueService = readFileSync(new URL('../services/practiceAnswerQueueService.ts', import.meta.url), 'utf8');
  const cleanupScript = readFileSync(new URL('../scripts/cleanupPracticeAnswerQueue.ts', import.meta.url), 'utf8');
  const serverPackage = readFileSync(new URL('../../package.json', import.meta.url), 'utf8');
  const redesignDoc = readFileSync(new URL('../../../docs/queue-redesign.md', import.meta.url), 'utf8');

  assert.match(adminRoute, /\/system\/practice-answer-queue/);
  assert.match(adminRoute, /getPracticeAnswerQueueMonitor/);
  assert.match(queueService, /recentFiveMinutes/);
  assert.match(queueService, /failedReasonsTop10/);
  assert.match(queueService, /practiceAnswerQueueWorkerConfig/);
  assert.match(cleanupScript, /status:\s*'processed'/);
  assert.match(cleanupScript, /createdAt:\s*\{\s*lt:\s*cutoff\s*\}/);
  assert.match(cleanupScript, /--confirm/);
  assert.match(cleanupScript, /dry-run/);
  assert.doesNotMatch(cleanupScript, /pending|processing|failed/);
  assert.match(serverPackage, /practice-answer-queue:cleanup/);
  assert.match(redesignDoc, /Redis \+ BullMQ/);
  assert.match(redesignDoc, /qanda-worker/);
  assert.match(redesignDoc, /灰度/);
});

test('system controls persist maintenance and worker pause settings safely', () => {
  const schema = readFileSync(new URL('../../prisma/schema.prisma', import.meta.url), 'utf8');
  const migration = readFileSync(new URL('../../prisma/migrations/20260630000100_add_system_controls_and_session_submission_queue/migration.sql', import.meta.url), 'utf8');
  const service = readFileSync(new URL('../services/systemControlService.ts', import.meta.url), 'utf8');
  const authMiddleware = readFileSync(new URL('../middleware/auth.ts', import.meta.url), 'utf8');
  const authService = readFileSync(new URL('../services/authService.ts', import.meta.url), 'utf8');
  const authRoute = readFileSync(new URL('../routes/auth.ts', import.meta.url), 'utf8');
  const adminRoute = readFileSync(new URL('../routes/admin.ts', import.meta.url), 'utf8');
  const env = readFileSync(new URL('../config/env.ts', import.meta.url), 'utf8');

  assert.match(schema, /model SystemSetting/);
  assert.match(schema, /userLoginDisabled\s+Boolean\s+@default\(false\)/);
  assert.match(schema, /practiceAnswerWorkerPaused\s+Boolean\s+@default\(false\)/);
  assert.match(migration, /CREATE TABLE `SystemSetting`/);
  assert.match(service, /USER_LOGIN_DISABLED/);
  assert.match(service, /SYSTEM_SETTINGS_CACHE_MS/);
  assert.match(service, /userForceLogoutAt: now/);
  assert.match(authMiddleware, /assertUserAccessAllowed/);
  assert.match(authMiddleware, /clearAuthCookies\(res,\s*'user'\)/);
  assert.match(authService, /assertUserLoginAllowed\(\)/);
  assert.match(authRoute, /assertUserLoginAllowed\(\)/);
  assert.match(adminRoute, /\/system\/controls/);
  assert.match(adminRoute, /\/system\/health/);
  assert.match(env, /SYSTEM_SETTINGS_CACHE_MS/);
  assert.match(env, /SYSTEM_HEALTH_CACHE_MS/);
});

test('session-level practice answer queue is wired through schema, API and worker', () => {
  const schema = readFileSync(new URL('../../prisma/schema.prisma', import.meta.url), 'utf8');
  const migration = readFileSync(new URL('../../prisma/migrations/20260630000100_add_system_controls_and_session_submission_queue/migration.sql', import.meta.url), 'utf8');
  const route = readFileSync(new URL('../routes/practice.ts', import.meta.url), 'utf8');
  const queueService = readFileSync(new URL('../services/practiceAnswerQueueService.ts', import.meta.url), 'utf8');
  const cleanupScript = readFileSync(new URL('../scripts/cleanupPracticeAnswerQueue.ts', import.meta.url), 'utf8');
  const workerSplitDoc = readFileSync(new URL('../../../docs/worker-split.md', import.meta.url), 'utf8');

  assert.match(schema, /model PracticeSession/);
  assert.match(schema, /model PracticeAnswerSubmissionQueue/);
  assert.match(schema, /@@unique\(\[userId,\s*practiceSessionId\]\)/);
  assert.match(schema, /@@unique\(\[userId,\s*clientSubmissionId\]\)/);
  assert.match(schema, /@@index\(\[status,\s*nextRunAt\]\)/);
  assert.match(migration, /CREATE TABLE `PracticeSession`/);
  assert.match(migration, /CREATE TABLE `PracticeAnswerSubmissionQueue`/);
  assert.match(route, /practiceSessionId/);
  assert.match(route, /clientSubmissionId/);
  assert.match(route, /enqueuePracticeAnswerSessionSubmission/);
  assert.match(queueService, /dedupeSessionAnswers/);
  assert.match(queueService, /processSessionQueueItem/);
  assert.match(queueService, /getPracticeAnswerWorkerPaused/);
  assert.match(queueService, /answer queue worker paused/);
  assert.match(queueService, /practiceAnswerSubmissionQueue/);
  assert.match(cleanupScript, /practiceAnswerSubmissionQueue/);
  assert.match(workerSplitDoc, /qanda-server/);
  assert.match(workerSplitDoc, /qanda-worker/);
});

test('practice resume sessions have account-scoped persistence safeguards', () => {
  const schema = readFileSync(new URL('../../prisma/schema.prisma', import.meta.url), 'utf8');
  const route = readFileSync(new URL('../routes/practice.ts', import.meta.url), 'utf8');
  const service = readFileSync(new URL('../services/practiceSessionService.ts', import.meta.url), 'utf8');
  const migration = readFileSync(new URL('../../prisma/migrations/20260625000100_add_user_practice_sessions/migration.sql', import.meta.url), 'utf8');

  assert.match(schema, /model UserPracticeSession/);
  assert.match(schema, /@@unique\(\[userId,\s*sessionKey\]\)/);
  assert.match(migration, /CREATE TABLE `UserPracticeSession`/);
  assert.match(route, /router\.get\('\/sessions'/);
  assert.match(route, /router\.put\('\/sessions'/);
  assert.match(route, /router\.delete\('\/sessions'/);
  assert.match(service, /userId_sessionKey:\s*\{\s*userId,\s*sessionKey\s*\}/);
  assert.match(service, /sessionSnapshotFingerprint/);
  assert.match(service, /findUnique/);
  assert.match(service, /existing && sessionSnapshotFingerprint/);
});

test('practice review summary uses user-scoped short cache and reports queued answers', () => {
  const route = readFileSync(new URL('../routes/practice.ts', import.meta.url), 'utf8');
  const service = readFileSync(new URL('../services/practiceStatsService.ts', import.meta.url), 'utf8');

  assert.match(route, /getPracticeReviewSummary\(req\.auth!\.userId,\s*\{/);
  assert.match(route, /subjectId: getOptionalQueryText\(req\.query\.subjectId\)/);
  assert.match(route, /bankId: getOptionalQueryText\(req\.query\.bankId\)/);
  assert.match(service, /reviewSummaryCacheKey\(userId,\s*scope\)/);
  assert.match(service, /practiceReviewSummaryCacheSeconds/);
  assert.match(service, /practiceAnswerQueueItem\.count/);
  assert.match(service, /pendingAnswerCount/);
  assert.match(service, /syncing: queuedAnswerCount > 0/);
});

test('admin activity trend uses application day buckets and distinct active users', () => {
  const trendStart = new Date(2026, 5, 26);
  const trend = buildDailyActivityTrend([
    { userId: 'u-before', createdAt: new Date(2026, 5, 25, 23, 59), isCorrect: true },
    { userId: 'u1', createdAt: new Date(2026, 5, 26, 23, 59), isCorrect: true },
    { userId: 'u1', createdAt: new Date(2026, 5, 27, 0, 1), isCorrect: false },
    { userId: 'u2', createdAt: new Date(2026, 5, 27, 8, 30), isCorrect: true },
    { userId: 'u2', createdAt: new Date(2026, 5, 27, 9, 0), isCorrect: true }
  ], trendStart, 2);

  assert.deepEqual(
    trend.map((row) => ({
      date: row.date,
      answerCount: row.answerCount,
      activeUserCount: row.activeUserCount,
      correctCount: row.correctCount,
      accuracy: row.accuracy
    })),
    [
      { date: '2026-06-26', answerCount: 1, activeUserCount: 1, correctCount: 1, accuracy: 100 },
      { date: '2026-06-27', answerCount: 3, activeUserCount: 2, correctCount: 2, accuracy: 67 }
    ]
  );
});

test('admin activity stats derive summary, trend and ranking from daily user aggregates', () => {
  const trendStart = new Date(2026, 5, 24);
  const sevenDayStart = new Date(2026, 5, 26);
  const today = new Date(2026, 6, 2);
  const stats = buildActivityStatsFromDailyUserAggregates([
    {
      date: '2026-06-24',
      userId: 'u-old',
      nickname: '旧记录',
      email: null,
      answerCount: 10,
      correctCount: 10,
      durationSeconds: 100
    },
    {
      date: '2026-06-26',
      userId: 'u-a',
      nickname: '甲同学',
      email: 'a@qq.com',
      answerCount: 2,
      correctCount: 1,
      durationSeconds: 30
    },
    {
      date: '2026-06-27',
      userId: 'u-a',
      nickname: '甲同学',
      email: 'a@qq.com',
      answerCount: 3,
      correctCount: 3,
      durationSeconds: 50
    },
    {
      date: '2026-07-02',
      userId: 'u-b',
      nickname: '乙同学',
      email: null,
      answerCount: 4,
      correctCount: 2,
      durationSeconds: 80
    }
  ], trendStart, 9, sevenDayStart, today);

  assert.deepEqual(stats.summary, {
    activeToday: 1,
    activeSevenDays: 2,
    answersToday: 4,
    answersSevenDays: 9,
    correctSevenDays: 6,
    durationSevenDays: 160
  });
  assert.deepEqual(
    stats.trend.map((row) => ({
      date: row.date,
      answerCount: row.answerCount,
      activeUserCount: row.activeUserCount,
      correctCount: row.correctCount,
      accuracy: row.accuracy
    })),
    [
      { date: '2026-06-24', answerCount: 10, activeUserCount: 1, correctCount: 10, accuracy: 100 },
      { date: '2026-06-25', answerCount: 0, activeUserCount: 0, correctCount: 0, accuracy: 0 },
      { date: '2026-06-26', answerCount: 2, activeUserCount: 1, correctCount: 1, accuracy: 50 },
      { date: '2026-06-27', answerCount: 3, activeUserCount: 1, correctCount: 3, accuracy: 100 },
      { date: '2026-06-28', answerCount: 0, activeUserCount: 0, correctCount: 0, accuracy: 0 },
      { date: '2026-06-29', answerCount: 0, activeUserCount: 0, correctCount: 0, accuracy: 0 },
      { date: '2026-06-30', answerCount: 0, activeUserCount: 0, correctCount: 0, accuracy: 0 },
      { date: '2026-07-01', answerCount: 0, activeUserCount: 0, correctCount: 0, accuracy: 0 },
      { date: '2026-07-02', answerCount: 4, activeUserCount: 1, correctCount: 2, accuracy: 50 }
    ]
  );
  assert.deepEqual(stats.topActiveUsers.map((row) => ({
    id: row.id,
    answerCount: row.answerCount,
    correctCount: row.correctCount,
    accuracy: row.accuracy,
    durationSeconds: row.durationSeconds
  })), [
    { id: 'u-a', answerCount: 5, correctCount: 4, accuracy: 80, durationSeconds: 80 },
    { id: 'u-b', answerCount: 4, correctCount: 2, accuracy: 50, durationSeconds: 80 }
  ]);
});

test('presence online window requires a fresh unended heartbeat', () => {
  const now = new Date('2026-06-28T12:00:00.000Z');

  assert.equal(
    isPresenceSessionOnline({ lastSeenAt: new Date(now.getTime() - PRESENCE_ONLINE_WINDOW_MS + 1) }, now),
    true
  );
  assert.equal(
    isPresenceSessionOnline({ lastSeenAt: new Date(now.getTime() - PRESENCE_ONLINE_WINDOW_MS - 1) }, now),
    false
  );
  assert.equal(
    isPresenceSessionOnline({
      lastSeenAt: new Date(now.getTime() - 10_000),
      endedAt: new Date(now.getTime() - 1_000)
    }, now),
    false
  );
});

test('presence session ids are bounded and URL-safe', () => {
  assert.equal(normalizePresenceSessionId('  tab-abc_123.456:789  '), 'tab-abc_123.456:789');
  assert.throws(() => normalizePresenceSessionId('short'), /在线会话标识无效/);
  assert.throws(() => normalizePresenceSessionId('bad id with spaces'), /在线会话标识无效/);
});

test('presence heartbeat architecture is wired through schema, API and user client', () => {
  const schema = readFileSync(new URL('../../prisma/schema.prisma', import.meta.url), 'utf8');
  const migration = readFileSync(new URL('../../prisma/migrations/20260628000100_add_user_presence_sessions/migration.sql', import.meta.url), 'utf8');
  const app = readFileSync(new URL('../app.ts', import.meta.url), 'utf8');
  const route = readFileSync(new URL('../routes/presence.ts', import.meta.url), 'utf8');
  const service = readFileSync(new URL('../services/presenceService.ts', import.meta.url), 'utf8');
  const analytics = readFileSync(new URL('../services/adminAnalyticsService.ts', import.meta.url), 'utf8');
  const userPresence = readFileSync(new URL('../../../user-web/src/utils/presence.ts', import.meta.url), 'utf8');
  const userPresenceConfig = readFileSync(new URL('../../../user-web/src/config/presence.ts', import.meta.url), 'utf8');
  const userApp = readFileSync(new URL('../../../user-web/src/App.vue', import.meta.url), 'utf8');
  const authStore = readFileSync(new URL('../../../user-web/src/stores/auth.ts', import.meta.url), 'utf8');

  assert.match(schema, /model UserPresenceSession/);
  assert.match(schema, /@@unique\(\[userId,\s*sessionId\]\)/);
  assert.match(migration, /CREATE TABLE `UserPresenceSession`/);
  assert.match(app, /app\.use\('\/api\/presence', presenceRouter\)/);
  assert.match(route, /router\.post\('\/heartbeat'/);
  assert.match(route, /router\.post\('\/leave'/);
  assert.match(route, /heartbeatIntervalMs/);
  assert.match(service, /PRESENCE_MIN_WRITE_INTERVAL_SECONDS/);
  assert.match(service, /throttled: true/);
  assert.match(service, /presenceCountCacheSeconds/);
  assert.match(service, /onlineCountCache/);
  assert.match(analytics, /listOnlinePresenceUsers\(now,\s*undefined,\s*\{\s*userForceLogoutAt/);
  assert.match(analytics, /countOnlinePresenceUsers\(now,\s*undefined,\s*\{\s*userForceLogoutAt/);
  assert.match(userPresenceConfig, /120000/);
  assert.match(userPresenceConfig, /300000/);
  assert.match(userPresence, /window\.setTimeout/);
  assert.match(userPresence, /sendHeartbeat\('visible'\)/);
  assert.match(userPresence, /window\.addEventListener\('pagehide', handlePageHide\)/);
  assert.match(userApp, /startPresenceHeartbeat\(\)/);
  assert.match(authStore, /stopPresenceHeartbeat\(\{ notify: true \}\)/);
});

test('presence and activity monitoring stay effective and non-blocking during maintenance', () => {
  const schema = readFileSync(new URL('../../prisma/schema.prisma', import.meta.url), 'utf8');
  const route = readFileSync(new URL('../routes/presence.ts', import.meta.url), 'utf8');
  const service = readFileSync(new URL('../services/presenceService.ts', import.meta.url), 'utf8');
  const controls = readFileSync(new URL('../services/systemControlService.ts', import.meta.url), 'utf8');
  const analytics = readFileSync(new URL('../services/adminAnalyticsService.ts', import.meta.url), 'utf8');
  const adminRoute = readFileSync(new URL('../routes/admin.ts', import.meta.url), 'utf8');
  const activityView = readFileSync(new URL('../../../admin-web/src/views/ActivityView.vue', import.meta.url), 'utf8');

  assert.match(schema, /@@index\(\[endedAt,\s*lastSeenAt,\s*userId\]\)/);
  assert.match(service, /getEffectiveOnlinePresenceFilter/);
  assert.match(service, /endStudentPresenceSessionsForMaintenance/);
  assert.match(service, /userForceLogoutAt/);
  assert.match(controls, /endStudentPresenceSessionsForMaintenance/);
  assert.match(route, /recordPresenceHeartbeatBestEffort/);
  assert.match(route, /alive:\s*false/);
  assert.match(route, /degraded:\s*true/);
  assert.match(analytics, /getAdminActivitySummary/);
  assert.match(analytics, /getAdminActivityDetail/);
  assert.match(analytics, /source:\s*'official_answers'/);
  assert.match(adminRoute, /router\.get\('\/activity\/summary'/);
  assert.match(adminRoute, /router\.get\('\/activity\/detail'/);
  assert.match(activityView, /summaryLoading/);
  assert.match(activityView, /detailLoading/);
  assert.doesNotMatch(activityView, /v-loading="loading"/);
});
