import { Prisma } from '@prisma/client';
import { env } from '../config/env.js';
import { prisma } from '../db/prisma.js';
import { HttpError } from '../utils/http.js';
import { UserRole } from '../utils/roles.js';

export const PRESENCE_HEARTBEAT_INTERVAL_MS = env.presenceHeartbeatIntervalMs;
export const PRESENCE_HEARTBEAT_INTERVAL_SECONDS = Math.round(PRESENCE_HEARTBEAT_INTERVAL_MS / 1000);
export const PRESENCE_ONLINE_WINDOW_SECONDS = env.presenceOnlineWindowSeconds;
export const PRESENCE_ONLINE_WINDOW_MS = PRESENCE_ONLINE_WINDOW_SECONDS * 1000;
export const PRESENCE_MIN_WRITE_INTERVAL_SECONDS = env.presenceMinWriteIntervalSeconds;
export const PRESENCE_SESSION_RETENTION_DAYS = 30;
const PRESENCE_CLEANUP_INTERVAL_MS = 12 * 60 * 60 * 1000;

const SESSION_ID_PATTERN = /^[A-Za-z0-9._:-]+$/;
let nextPresenceCleanupAt = 0;
let onlineUsersCache: { key: string; expiresAt: number; value: OnlinePresenceUser[] } | null = null;
let onlineCountCache: { key: string; expiresAt: number; value: number } | null = null;
let nextHeartbeatFailureLogAt = 0;

export type OnlinePresenceUser = {
  id: string;
  nickname: string;
  email: string | null;
  lastSeenAt: Date;
};

type PresenceRow = {
  endedAt?: Date | null;
  lastSeenAt?: Date | null;
};

type OnlinePresenceRow = {
  id: string;
  nickname: string;
  email: string | null;
  lastSeenAt: Date;
};

type OnlinePresenceCountRow = {
  onlineCount: bigint | number;
};

type EffectiveOnlineOptions = {
  userForceLogoutAt?: Date | null;
};

function toNumber(value: bigint | number | null | undefined) {
  return Number(value || 0);
}

export function normalizePresenceSessionId(value: unknown) {
  const sessionId = String(value || '').trim();
  if (sessionId.length < 8 || sessionId.length > 120 || !SESSION_ID_PATTERN.test(sessionId)) {
    throw new HttpError('在线会话标识无效，请刷新页面后重试', 400);
  }
  return sessionId;
}

export function isPresenceSessionOnline(row: PresenceRow, now = new Date(), windowMs = PRESENCE_ONLINE_WINDOW_MS) {
  if (row.endedAt || !row.lastSeenAt) return false;
  const ageMs = now.getTime() - row.lastSeenAt.getTime();
  return ageMs >= 0 && ageMs <= windowMs;
}

function trimNullable(value: string | undefined, maxLength: number) {
  const normalized = String(value || '').trim();
  return normalized ? normalized.slice(0, maxLength) : null;
}

export function presenceOnlineSince(now = new Date(), windowMs = PRESENCE_ONLINE_WINDOW_MS) {
  return new Date(now.getTime() - windowMs);
}

function presenceCacheKey(windowMs: number, options: EffectiveOnlineOptions = {}) {
  return `${windowMs}:${options.userForceLogoutAt?.getTime() || 0}`;
}

export function getEffectiveOnlinePresenceFilter(options: EffectiveOnlineOptions = {}) {
  const forceLogoutAt = options.userForceLogoutAt;
  return forceLogoutAt
    ? Prisma.sql`AND p.\`lastSeenAt\` >= ${forceLogoutAt}`
    : Prisma.empty;
}

function invalidatePresenceOnlineCache() {
  onlineUsersCache = null;
  onlineCountCache = null;
}

export async function cleanupStalePresenceSessions(now = new Date(), retentionDays = PRESENCE_SESSION_RETENTION_DAYS) {
  const cutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);
  return prisma.userPresenceSession.deleteMany({
    where: {
      OR: [
        { endedAt: { lt: cutoff } },
        { endedAt: null, lastSeenAt: { lt: cutoff } }
      ]
    }
  });
}

function maybeCleanupStalePresenceSessions(now: Date) {
  if (now.getTime() < nextPresenceCleanupAt) return;
  nextPresenceCleanupAt = now.getTime() + PRESENCE_CLEANUP_INTERVAL_MS;
  void cleanupStalePresenceSessions(now).catch((error) => {
    if (process.env.NODE_ENV !== 'production') console.error('在线会话清理失败', error);
  });
}

export async function recordPresenceHeartbeat(input: {
  userId: string;
  sessionId: string;
  userAgent?: string;
  ipAddress?: string;
  now?: Date;
}) {
  const now = input.now || new Date();
  maybeCleanupStalePresenceSessions(now);
  const uniqueWhere = {
    userId_sessionId: {
      userId: input.userId,
      sessionId: input.sessionId
    }
  };
  const existing = await prisma.userPresenceSession.findUnique({
    where: uniqueWhere,
    select: {
      id: true,
      userId: true,
      sessionId: true,
      userAgent: true,
      ipAddress: true,
      lastSeenAt: true,
      endedAt: true,
      createdAt: true,
      updatedAt: true
    }
  });
  const minWriteIntervalMs = PRESENCE_MIN_WRITE_INTERVAL_SECONDS * 1000;
  if (
    existing
    && !existing.endedAt
    && minWriteIntervalMs > 0
    && now.getTime() - existing.lastSeenAt.getTime() < minWriteIntervalMs
  ) {
    return { ...existing, throttled: true };
  }

  const session = await prisma.userPresenceSession.upsert({
    where: {
      userId_sessionId: {
        userId: input.userId,
        sessionId: input.sessionId
      }
    },
    create: {
      userId: input.userId,
      sessionId: input.sessionId,
      userAgent: trimNullable(input.userAgent, 500),
      ipAddress: trimNullable(input.ipAddress, 80),
      lastSeenAt: now,
      endedAt: null
    },
    update: {
      userAgent: trimNullable(input.userAgent, 500),
      ipAddress: trimNullable(input.ipAddress, 80),
      lastSeenAt: now,
      endedAt: null
    }
  });
  invalidatePresenceOnlineCache();
  return { ...session, throttled: false };
}

export async function recordPresenceHeartbeatBestEffort(input: {
  userId: string;
  sessionId: string;
  userAgent?: string;
  ipAddress?: string;
  now?: Date;
}) {
  try {
    return {
      session: await recordPresenceHeartbeat(input),
      degraded: false
    };
  } catch (error) {
    const now = Date.now();
    if (now >= nextHeartbeatFailureLogAt) {
      nextHeartbeatFailureLogAt = now + 60_000;
      console.error('在线心跳写入失败，已降级为非阻塞响应', error);
    }
    return {
      session: null,
      degraded: true
    };
  }
}

export async function endPresenceSession(input: { userId: string; sessionId: string; now?: Date }) {
  const now = input.now || new Date();
  const result = await prisma.userPresenceSession.updateMany({
    where: {
      userId: input.userId,
      sessionId: input.sessionId,
      endedAt: null
    },
    data: {
      endedAt: now
    }
  });
  if (result.count > 0) {
    invalidatePresenceOnlineCache();
  }
  return result;
}

export async function endStudentPresenceSessionsForMaintenance(now = new Date()) {
  const result = await prisma.userPresenceSession.updateMany({
    where: {
      endedAt: null,
      user: {
        role: UserRole.STUDENT
      }
    },
    data: {
      endedAt: now
    }
  });
  if (result.count > 0) invalidatePresenceOnlineCache();
  return result;
}

export async function listOnlinePresenceUsers(
  now = new Date(),
  windowMs = PRESENCE_ONLINE_WINDOW_MS,
  options: EffectiveOnlineOptions = {}
) {
  const cacheTtlMs = env.presenceCountCacheSeconds * 1000;
  const cacheNow = Date.now();
  const cacheKey = presenceCacheKey(windowMs, options);
  if (
    cacheTtlMs > 0
    && onlineUsersCache
    && onlineUsersCache.key === cacheKey
    && onlineUsersCache.expiresAt > cacheNow
  ) {
    return onlineUsersCache.value;
  }

  const onlineSince = presenceOnlineSince(now, windowMs);
  const effectiveFilter = getEffectiveOnlinePresenceFilter(options);
  const rows = await prisma.$queryRaw<OnlinePresenceRow[]>(Prisma.sql`
    SELECT
      u.\`id\`,
      u.\`nickname\`,
      u.\`email\`,
      MAX(p.\`lastSeenAt\`) AS \`lastSeenAt\`
    FROM \`UserPresenceSession\` p
    INNER JOIN \`User\` u ON u.\`id\` = p.\`userId\`
    WHERE p.\`lastSeenAt\` >= ${onlineSince}
      AND p.\`endedAt\` IS NULL
      ${effectiveFilter}
      AND u.\`role\` = ${UserRole.STUDENT}
      AND u.\`isActive\` = 1
    GROUP BY u.\`id\`, u.\`nickname\`, u.\`email\`
    ORDER BY \`lastSeenAt\` DESC
    LIMIT 50
  `);

  if (cacheTtlMs > 0) onlineUsersCache = { key: cacheKey, expiresAt: cacheNow + cacheTtlMs, value: rows };
  return rows;
}

export async function countOnlinePresenceUsers(
  now = new Date(),
  windowMs = PRESENCE_ONLINE_WINDOW_MS,
  options: EffectiveOnlineOptions = {}
) {
  const cacheTtlMs = env.presenceCountCacheSeconds * 1000;
  const cacheNow = Date.now();
  const cacheKey = presenceCacheKey(windowMs, options);
  if (
    cacheTtlMs > 0
    && onlineCountCache
    && onlineCountCache.key === cacheKey
    && onlineCountCache.expiresAt > cacheNow
  ) {
    return onlineCountCache.value;
  }

  const onlineSince = presenceOnlineSince(now, windowMs);
  const effectiveFilter = getEffectiveOnlinePresenceFilter(options);
  const rows = await prisma.$queryRaw<OnlinePresenceCountRow[]>(Prisma.sql`
    SELECT COUNT(DISTINCT p.\`userId\`) AS \`onlineCount\`
    FROM \`UserPresenceSession\` p
    INNER JOIN \`User\` u ON u.\`id\` = p.\`userId\`
    WHERE p.\`lastSeenAt\` >= ${onlineSince}
      AND p.\`endedAt\` IS NULL
      ${effectiveFilter}
      AND u.\`role\` = ${UserRole.STUDENT}
      AND u.\`isActive\` = 1
  `);

  const count = toNumber(rows[0]?.onlineCount);
  if (cacheTtlMs > 0) onlineCountCache = { key: cacheKey, expiresAt: cacheNow + cacheTtlMs, value: count };
  return count;
}
