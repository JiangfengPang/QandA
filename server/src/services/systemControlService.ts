import { env } from '../config/env.js';
import { prisma } from '../db/prisma.js';
import { endStudentPresenceSessionsForMaintenance } from './presenceService.js';
import { HttpError } from '../utils/http.js';
import { UserRole, type UserRole as UserRoleType } from '../utils/roles.js';

export const USER_LOGIN_DISABLED = 'USER_LOGIN_DISABLED';
export const USER_LOGIN_DISABLED_MESSAGE = '系统维护中，暂时无法登录，请稍后再试';

const SYSTEM_SETTING_ID = 'global';
const SYSTEM_SETTINGS_CACHE_MS = env.systemSettingsCacheMs;

type SystemControlSnapshot = {
  userLoginDisabled: boolean;
  userLoginDisabledUpdatedAt: Date | null;
  userForceLogoutAt: Date | null;
  practiceAnswerWorkerPaused: boolean;
  practiceAnswerWorkerPausedUpdatedAt: Date | null;
  updatedAt: Date | null;
};

let cachedControls: { expiresAt: number; value: SystemControlSnapshot } | null = null;

const defaultControls = (): SystemControlSnapshot => ({
  userLoginDisabled: false,
  userLoginDisabledUpdatedAt: null,
  userForceLogoutAt: null,
  practiceAnswerWorkerPaused: false,
  practiceAnswerWorkerPausedUpdatedAt: null,
  updatedAt: null
});

function snapshotFromRow(row: {
  userLoginDisabled: boolean;
  userLoginDisabledUpdatedAt: Date | null;
  userForceLogoutAt: Date | null;
  practiceAnswerWorkerPaused: boolean;
  practiceAnswerWorkerPausedUpdatedAt: Date | null;
  updatedAt: Date;
} | null): SystemControlSnapshot {
  if (!row) return defaultControls();
  return {
    userLoginDisabled: Boolean(row.userLoginDisabled),
    userLoginDisabledUpdatedAt: row.userLoginDisabledUpdatedAt,
    userForceLogoutAt: row.userForceLogoutAt,
    practiceAnswerWorkerPaused: Boolean(row.practiceAnswerWorkerPaused),
    practiceAnswerWorkerPausedUpdatedAt: row.practiceAnswerWorkerPausedUpdatedAt,
    updatedAt: row.updatedAt
  };
}

function cacheControls(value: SystemControlSnapshot) {
  if (SYSTEM_SETTINGS_CACHE_MS <= 0) {
    cachedControls = null;
    return value;
  }
  cachedControls = { value, expiresAt: Date.now() + SYSTEM_SETTINGS_CACHE_MS };
  return value;
}

export function invalidateSystemControlsCache() {
  cachedControls = null;
}

export async function getSystemControls() {
  if (cachedControls && cachedControls.expiresAt > Date.now()) return cachedControls.value;
  const row = await prisma.systemSetting.findUnique({ where: { id: SYSTEM_SETTING_ID } });
  return cacheControls(snapshotFromRow(row));
}

export async function updateSystemControls(input: {
  userLoginDisabled?: boolean;
  practiceAnswerWorkerPaused?: boolean;
}) {
  const now = new Date();
  const data: {
    userLoginDisabled?: boolean;
    userLoginDisabledUpdatedAt?: Date;
    userForceLogoutAt?: Date;
    practiceAnswerWorkerPaused?: boolean;
    practiceAnswerWorkerPausedUpdatedAt?: Date;
  } = {};

  if (typeof input.userLoginDisabled === 'boolean') {
    data.userLoginDisabled = input.userLoginDisabled;
    data.userLoginDisabledUpdatedAt = now;
    Object.assign(data, input.userLoginDisabled ? { userForceLogoutAt: now } : {});
  }

  if (typeof input.practiceAnswerWorkerPaused === 'boolean') {
    data.practiceAnswerWorkerPaused = input.practiceAnswerWorkerPaused;
    data.practiceAnswerWorkerPausedUpdatedAt = now;
  }

  const row = await prisma.systemSetting.upsert({
    where: { id: SYSTEM_SETTING_ID },
    create: {
      id: SYSTEM_SETTING_ID,
      userLoginDisabled: input.userLoginDisabled ?? false,
      userLoginDisabledUpdatedAt: typeof input.userLoginDisabled === 'boolean' ? now : null,
      userForceLogoutAt: input.userLoginDisabled ? now : null,
      practiceAnswerWorkerPaused: input.practiceAnswerWorkerPaused ?? false,
      practiceAnswerWorkerPausedUpdatedAt: typeof input.practiceAnswerWorkerPaused === 'boolean' ? now : null
    },
    update: data
  });
  invalidateSystemControlsCache();
  if (input.userLoginDisabled) {
    void endStudentPresenceSessionsForMaintenance(now).catch((error) => {
      console.error('维护模式在线会话失效失败', error);
    });
  }
  return cacheControls(snapshotFromRow(row));
}

export async function assertUserLoginAllowed() {
  const controls = await getSystemControls();
  if (controls.userLoginDisabled) {
    throw new HttpError(USER_LOGIN_DISABLED_MESSAGE, 401, USER_LOGIN_DISABLED);
  }
}

export async function assertUserAccessAllowed(options: {
  role: UserRoleType;
  tokenIssuedAt?: number;
}) {
  if (options.role !== UserRole.STUDENT) return;
  const controls = await getSystemControls();
  if (controls.userLoginDisabled) {
    throw new HttpError(USER_LOGIN_DISABLED_MESSAGE, 401, USER_LOGIN_DISABLED);
  }

  const forceLogoutAt = controls.userForceLogoutAt?.getTime() || 0;
  const issuedAtMs = Number(options.tokenIssuedAt || 0) * 1000;
  if (forceLogoutAt > 0 && issuedAtMs > 0 && issuedAtMs < forceLogoutAt) {
    throw new HttpError('登录已失效，请重新登录', 401);
  }
}

export async function getPracticeAnswerWorkerPaused() {
  const controls = await getSystemControls();
  return controls.practiceAnswerWorkerPaused;
}

export function serializeSystemControls(controls: SystemControlSnapshot) {
  return {
    userLoginDisabled: controls.userLoginDisabled,
    userLoginDisabledUpdatedAt: controls.userLoginDisabledUpdatedAt?.toISOString() || null,
    userForceLogoutAt: controls.userForceLogoutAt?.toISOString() || null,
    practiceAnswerWorkerPaused: controls.practiceAnswerWorkerPaused,
    practiceAnswerWorkerPausedUpdatedAt: controls.practiceAnswerWorkerPausedUpdatedAt?.toISOString() || null,
    updatedAt: controls.updatedAt?.toISOString() || null
  };
}
