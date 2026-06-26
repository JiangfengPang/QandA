import type { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma.js';

export type PracticeSessionSnapshot = Prisma.InputJsonObject;

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
  const row = await prisma.userPracticeSession.upsert({
    where: { userId_sessionKey: { userId, sessionKey } },
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
