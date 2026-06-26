import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import type { NextFunction, Request, Response } from 'express';
import { isAnswerCorrect, isFillAnswerCorrect, normalizeAnswer, normalizeFillAnswerGroups } from './answer.js';
import { asyncHandler } from './asyncHandler.js';
import { isSupportedImageBuffer } from '../services/avatarStorage.js';
import { clientIp } from '../middleware/rateLimit.js';
import { createVerificationCode } from './verificationCode.js';
import { summarizeBankProgress, summarizeLatestAnswers } from '../services/progressService.js';
import { formatQuestion } from '../services/questionService.js';

test('answer comparison normalizes case, order and duplicates', () => {
  assert.deepEqual(normalizeAnswer(['b', ' A ', 'a']), ['A', 'B']);
  assert.equal(isAnswerCorrect(['b', 'a'], ['A', 'B']), true);
  assert.equal(isAnswerCorrect(['A'], ['A', 'B']), false);
  assert.equal(isAnswerCorrect([' Adequately '], ['adequately']), true);
  assert.equal(isAnswerCorrect(['look upon ... as'], ['look upon … as']), true);
});

test('fill answer comparison accepts any configured answer variant', () => {
  assert.equal(isFillAnswerCorrect([' Colour '], ['color', 'colour']), true);
  assert.equal(isFillAnswerCorrect(['color'], ['color', 'colour']), true);
  assert.equal(isFillAnswerCorrect(['colours'], ['color', 'colour']), false);
  assert.equal(isAnswerCorrect(['color'], ['color', 'colour']), false);
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
});
