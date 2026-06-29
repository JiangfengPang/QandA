import type { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma.js';

export type PracticeSessionSnapshot = Prisma.InputJsonObject;

function sessionSnapshotFingerprint(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return JSON.stringify(value);
  const { updatedAt: _updatedAt, ...stableValue } = value as Record<string, unknown>;
  return JSON.stringify(stableValue);
}

export async function getPracticeSession(userId: string, sessionKey: string) {
  const row = await prisma.userPracticeSession.findUnique({
    where: { userId_sessionKey: { userId, sessionKey } },
    select: { payloadJson: true, updatedAt: true }
  });

  if (!row) return { snapshot: null, updatedAt: null };
  return {
    snapshot: row.payloadJson,
    updatedAt: row.updatedAt.toISOString()
  };
}

export async function savePracticeSession(userId: string, sessionKey: string, snapshot: PracticeSessionSnapshot) {
  const where = { userId_sessionKey: { userId, sessionKey } };
  const existing = await prisma.userPracticeSession.findUnique({
    where,
    select: { payloadJson: true, updatedAt: true }
  });

  const row = existing && sessionSnapshotFingerprint(existing.payloadJson) === sessionSnapshotFingerprint(snapshot)
    ? existing
    : await prisma.userPracticeSession.upsert({
      where,
      update: { payloadJson: snapshot },
      create: { userId, sessionKey, payloadJson: snapshot },
      select: { payloadJson: true, updatedAt: true }
    });

  return {
    snapshot: row.payloadJson,
    updatedAt: row.updatedAt.toISOString()
  };
}

export async function deletePracticeSession(userId: string, sessionKey: string) {
  await prisma.userPracticeSession.deleteMany({ where: { userId, sessionKey } });
  return { deleted: true };
}
