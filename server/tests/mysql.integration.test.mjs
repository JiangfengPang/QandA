import assert from 'node:assert/strict';
import test, { before, after } from 'node:test';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

// This suite writes only to a disposable local instance with an explicit address.
const target = new URL(process.env.DATABASE_URL || 'mysql://missing');
if (target.hostname !== '127.0.0.1' || target.port !== '13317' || target.pathname !== '/qanda_review_test') {
  throw new Error('Integration tests require mysql://...@127.0.0.1:13317/qanda_review_test');
}
const { prisma } = await import('../dist/db/prisma.js');
const { env } = await import('../dist/config/env.js');
const { enqueuePracticeAnswerSessionSubmission, drainPracticeAnswerQueueForUser,
  markSessionQueueItemProcessed, markSessionQueueItemFailed } = await import('../dist/services/practiceAnswerQueueService.js');
const { processActivityAggregationBatch } = await import('../dist/services/activityAggregationService.js');
const { getAdminActivityDetail } = await import('../dist/services/adminAnalyticsService.js');
const { clearPracticeRecords, submitPracticeAnswer } = await import('../dist/services/practiceRecordService.js');
const { getBanksProgress } = await import('../dist/services/progressService.js');
const { createApp } = await import('../dist/app.js');
const { HttpError } = await import('../dist/utils/http.js');
const prefix = `integration-${Date.now()}`;
let bank, subject, questions, server, base;
const users = [];

async function user(suffix, role = 'STUDENT') {
  const item = await prisma.user.create({ data: { username: `${prefix}-${suffix}`, nickname: '测试学生',
    passwordHash: await bcrypt.hash('Integration_Only_2026!', 4), role, email: `${prefix}-${suffix}@qq.com` } });
  users.push(item); return item;
}
function submission(session, indexes) {
  return { practiceSessionId: `${prefix}-${session}`, clientSubmissionId: `${prefix}-${session}-${Math.random()}`,
    answers: indexes.map((index) => ({ questionId: questions[index].id, clientAnswerId: `${prefix}-${session}-${index}`, selected: ['A'], durationSeconds: 2 })) };
}
function headers(item, client = 'user') {
  const csrf = 'integration-csrf';
  const token = jwt.sign({ userId: item.id, role: item.role, username: item.username, audience: client,
    sessionVersion: 0, csrfToken: csrf }, env.jwtSecret);
  return { 'Content-Type': 'application/json', 'X-Qanda-Client': client, 'X-CSRF-Token': csrf,
    Cookie: `qanda_${client}_auth=${token}; qanda_${client}_csrf=${csrf}` };
}

before(async () => {
  subject = await prisma.subject.create({ data: { name: `${prefix}-subject` } });
  bank = await prisma.bank.create({ data: { name: `${prefix}-bank`, subjectId: subject.id } });
  questions = [];
  for (let i = 0; i < 8; i++) questions.push(await prisma.question.create({ data: {
    bankId: bank.id, type: 'single', stem: `测试题目 ${i}`, answerJson: ['A'], explanation: '测试解析',
    options: { create: [{ label: 'A', content: '正确选项', isCorrect: true }, { label: 'B', content: '错误选项' }] }
  } }));
  server = createApp().listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}/api`;
});
after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  await prisma.user.deleteMany({ where: { id: { in: users.map((item) => item.id) } } });
  if (subject) await prisma.subject.delete({ where: { id: subject.id } });
  await prisma.$disconnect();
});

test('MySQL parallel first submissions retain all accepted answers', async () => {
  const student = await user('concurrent');
  const results = await Promise.all(Array.from({ length: 8 }, (_, i) => enqueuePracticeAnswerSessionSubmission(student.id, submission('concurrent', [i]))));
  assert.equal(results.every((item) => item.accepted === 1), true);
  const row = await prisma.practiceAnswerSubmissionQueue.findFirst({ where: { userId: student.id } });
  assert.equal(row.answersJson.length, 8);
  await drainPracticeAnswerQueueForUser(student.id);
  assert.equal(await prisma.userAnswer.count({ where: { userId: student.id } }), 8);
  const done = await prisma.practiceAnswerSubmissionQueue.findUnique({ where: { id: row.id } });
  assert.equal(done.status, 'processed'); assert.equal(done.payloadVersion, done.processedPayloadVersion);
});

test('MySQL appended payload survives completion of an older version', async () => {
  const student = await user('append');
  await enqueuePracticeAnswerSessionSubmission(student.id, submission('append', [0]));
  const row = await prisma.practiceAnswerSubmissionQueue.findFirst({ where: { userId: student.id } });
  const item = await prisma.practiceAnswerSubmissionQueue.update({ where: { id: row.id }, data: { status: 'processing', lockedAt: new Date() } });
  await enqueuePracticeAnswerSessionSubmission(student.id, submission('append', [1]));
  assert.equal(await markSessionQueueItemProcessed(item, { answerCount: 1, correctCount: 1, durationSeconds: 2 }), false);
  const retry = await prisma.practiceAnswerSubmissionQueue.findUnique({ where: { id: row.id } });
  assert.equal(retry.status, 'retrying'); assert.equal(retry.answersJson.length, 2);
  await drainPracticeAnswerQueueForUser(student.id);
  assert.equal(await prisma.userAnswer.count({ where: { userId: student.id } }), 2);
});

test('MySQL expired processing lease cannot override a new processor', async () => {
  const student = await user('lease');
  await enqueuePracticeAnswerSessionSubmission(student.id, submission('lease', [0]));
  const row = await prisma.practiceAnswerSubmissionQueue.findFirst({ where: { userId: student.id } });
  const old = await prisma.practiceAnswerSubmissionQueue.update({ where: { id: row.id }, data: { status: 'processing', lockedAt: new Date(Date.now() - 180000) } });
  const fresh = new Date();
  await prisma.practiceAnswerSubmissionQueue.update({ where: { id: row.id }, data: { lockedAt: fresh } });
  await markSessionQueueItemFailed(old, new HttpError('old failure', 400));
  assert.equal(await markSessionQueueItemProcessed(old, { answerCount: 1, correctCount: 1, durationSeconds: 2 }), false);
  const current = await prisma.practiceAnswerSubmissionQueue.findUnique({ where: { id: row.id } });
  assert.equal(current.status, 'processing'); assert.equal(current.lockedAt.getTime(), fresh.getTime());
});

test('MySQL late commits and concurrent aggregators count every answer exactly once', async () => {
  const student = await user('late');
  let visible, finish;
  const ready = new Promise((resolve) => { visible = resolve; });
  const commit = new Promise((resolve) => { finish = resolve; });
  const early = prisma.$transaction(async (tx) => {
    await tx.userAnswer.create({ data: { userId: student.id, questionId: questions[0].id, selectedJson: ['A'], isCorrect: true,
      createdAt: new Date('2026-10-07T00:00:00Z'), durationSeconds: 2 } });
    visible(); await commit;
  }, { timeout: 15000 });
  await ready;
  await prisma.userAnswer.create({ data: { userId: student.id, questionId: questions[1].id, selectedJson: ['A'], isCorrect: true,
    createdAt: new Date('2026-10-07T00:00:01Z'), durationSeconds: 2 } });
  try { await processActivityAggregationBatch(); } finally { finish(); await early; }
  await Promise.all([processActivityAggregationBatch(), processActivityAggregationBatch()]);
  await processActivityAggregationBatch();
  const stat = await prisma.userDailyActivityStat.findFirst({ where: { userId: student.id } });
  assert.equal(stat.answerCount, 2); assert.equal(stat.durationSeconds, 4);
  assert.equal(stat.firstAnsweredAt.toISOString(), '2026-10-07T00:00:00.000Z');
});

test('MySQL clearing records removes derived totals and rejects a stale queued write', async () => {
  const student = await user('clear');
  await enqueuePracticeAnswerSessionSubmission(student.id, submission('clear', [0]));
  const row = await prisma.practiceAnswerSubmissionQueue.findFirst({ where: { userId: student.id } });
  const old = await prisma.practiceAnswerSubmissionQueue.update({ where: { id: row.id }, data: { status: 'processing', lockedAt: new Date() } });
  await submitPracticeAnswer(student.id, questions[1].id, ['A'], 1, `${prefix}-clear-direct`);
  await processActivityAggregationBatch();
  await clearPracticeRecords(student.id);
  await assert.rejects(submitPracticeAnswer(student.id, questions[0].id, ['A'], 2, `${prefix}-clear-stale`, { kind: 'session', id: row.id, lockedAt: old.lockedAt }), /已更新或清除/);
  await processActivityAggregationBatch();
  assert.equal(await prisma.userAnswer.count({ where: { userId: student.id } }), 0);
  assert.equal(await prisma.userDailyActivityStat.count({ where: { userId: student.id } }), 0);
});

test('MySQL bank progress returns only the latest answer per question', async () => {
  const student = await user('progress');
  await submitPracticeAnswer(student.id, questions[0].id, ['B'], 1, `${prefix}-progress-old`);
  await submitPracticeAnswer(student.id, questions[0].id, ['A'], 1, `${prefix}-progress-new`);
  const progress = (await getBanksProgress(student.id, [bank.id])).get(bank.id);
  assert.equal(progress.answerCount, 1); assert.equal(progress.correctCount, 1);
});

test('HTTP remote resume accepts the frontend metadata and restores it', async () => {
  const student = await user('resume');
  const snapshot = { version: 1, practiceSessionId: 'resume-session', scope: 'practice', submitted: false,
    currentIndex: 0, questionId: questions[0].id, questionIds: [questions[0].id], sessionRecords: {}, updatedAt: new Date().toISOString() };
  const saved = await fetch(`${base}/practice/sessions`, { method: 'PUT', headers: headers(student), body: JSON.stringify({ key: 'resume-key', snapshot }) });
  assert.equal(saved.status, 200); assert.equal((await saved.json()).data.snapshot.practiceSessionId, 'resume-session');
  const restored = await fetch(`${base}/practice/sessions?key=resume-key`, { headers: headers(student) });
  assert.deepEqual((await restored.json()).data.snapshot, snapshot);
});

test('HTTP batch contract accepts 500 records and rejects 501 safely', async () => {
  const student = await user('batch');
  const input = submission('batch', [0]);
  const first = input.answers[0];
  const answers = Array.from({ length: 500 }, (_, i) => ({ ...first, clientAnswerId: `${prefix}-batch-${i}`, isCorrect: true }));
  const accepted = await fetch(`${base}/practice/answers/batch`, { method: 'POST', headers: headers(student), body: JSON.stringify({ ...input, answers }) });
  assert.equal(accepted.status, 200);
  const oversized = await fetch(`${base}/practice/answers/batch`, { method: 'POST', headers: headers(student), body: JSON.stringify({ ...input, answers: [...answers, { ...first, clientAnswerId: 'extra', isCorrect: true }] }) });
  assert.equal(oversized.status, 400);
});

test('HTTP admin ranges and user summary remain consistent', async () => {
  const admin = await user('admin', 'ADMIN');
  const seven = await fetch(`${base}/admin/activity/detail?days=7`, { headers: headers(admin, 'admin') });
  const thirty = await fetch(`${base}/admin/activity/detail?days=30`, { headers: headers(admin, 'admin') });
  assert.equal((await seven.json()).data.days, 7); assert.equal((await thirty.json()).data.days, 30);
  const response = await fetch(`${base}/admin/users?pageSize=100`, { headers: headers(admin, 'admin') });
  const data = (await response.json()).data;
  assert.equal(data.summary.total, data.meta.total);
  assert.equal(data.summary.total, data.summary.activeCount + data.summary.inactiveCount);
});
