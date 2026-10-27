import '../config/env.js';
import { prisma } from '../db/prisma.js';

function argValue(name: string) {
  const prefix = `${name}=`;
  const matched = process.argv.find((item) => item.startsWith(prefix));
  if (matched) return matched.slice(prefix.length);
  const index = process.argv.indexOf(name);
  if (index >= 0) return process.argv[index + 1];
  return '';
}

function parseDays() {
  const value = Number(argValue('--days') || '7');
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error('请使用 --days 指定大于 0 的保留天数，例如 --days=14');
  }
  return Math.floor(value);
}

function hasConfirmFlag() {
  return process.argv.includes('--confirm');
}

function isoOrNull(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

async function main() {
  const days = parseDays();
  const confirmed = hasConfirmFlag();
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const where = {
    status: 'processed',
    createdAt: { lt: cutoff }
  };

  const [count, sessionCount, range, sessionRange] = await Promise.all([
    prisma.practiceAnswerQueueItem.count({ where }),
    prisma.practiceAnswerSubmissionQueue.count({ where }),
    prisma.practiceAnswerQueueItem.aggregate({
      where,
      _min: { createdAt: true },
      _max: { createdAt: true }
    }),
    prisma.practiceAnswerSubmissionQueue.aggregate({
      where,
      _min: { createdAt: true },
      _max: { createdAt: true }
    })
  ]);

  console.log(`practice answer queue cleanup ${confirmed ? 'confirm' : 'dry-run'}`);
  console.log(`criteria: status=processed, createdAt < ${cutoff.toISOString()} (--days=${days})`);
  console.log(`legacyMatched: ${count}`);
  console.log(`oldestCreatedAt: ${isoOrNull(range._min.createdAt)}`);
  console.log(`newestCreatedAt: ${isoOrNull(range._max.createdAt)}`);
  console.log(`sessionMatched: ${sessionCount}`);
  console.log(`sessionOldestCreatedAt: ${isoOrNull(sessionRange._min.createdAt)}`);
  console.log(`sessionNewestCreatedAt: ${isoOrNull(sessionRange._max.createdAt)}`);

  if (!confirmed) {
    console.log('dry-run only; pass --confirm to delete matched processed rows.');
    return;
  }

  const [legacyResult, sessionResult] = await prisma.$transaction([
    prisma.practiceAnswerQueueItem.deleteMany({ where }),
    prisma.practiceAnswerSubmissionQueue.deleteMany({ where })
  ]);
  console.log(`legacyDeleted: ${legacyResult.count}`);
  console.log(`sessionDeleted: ${sessionResult.count}`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
