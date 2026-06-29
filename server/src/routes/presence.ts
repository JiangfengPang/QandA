import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { authRequired } from '../middleware/auth.js';
import { clientIp } from '../middleware/rateLimit.js';
import {
  endPresenceSession,
  normalizePresenceSessionId,
  PRESENCE_HEARTBEAT_INTERVAL_MS,
  PRESENCE_HEARTBEAT_INTERVAL_SECONDS,
  PRESENCE_ONLINE_WINDOW_SECONDS,
  recordPresenceHeartbeat
} from '../services/presenceService.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { fail, ok } from '../utils/http.js';
import { UserRole } from '../utils/roles.js';

const router = Router();

const presenceSchema = z.object({
  sessionId: z.unknown()
});

router.use(authRequired);

function requireStudent(req: Request, res: Response) {
  if (req.auth?.role !== UserRole.STUDENT) {
    fail(res, '只有答题端账号可以上报在线状态', 403);
    return false;
  }
  return true;
}

router.post('/heartbeat', asyncHandler(async (req, res) => {
  if (!requireStudent(req, res)) return;

  const input = presenceSchema.parse(req.body);
  const sessionId = normalizePresenceSessionId(input.sessionId);
  const session = await recordPresenceHeartbeat({
    userId: req.auth!.userId,
    sessionId,
    userAgent: String(req.headers['user-agent'] || ''),
    ipAddress: clientIp(req)
  });

  return ok(res, {
    alive: true,
    sessionId,
    lastSeenAt: session.lastSeenAt,
    throttled: Boolean(session.throttled),
    heartbeatIntervalMs: PRESENCE_HEARTBEAT_INTERVAL_MS,
    heartbeatIntervalSeconds: PRESENCE_HEARTBEAT_INTERVAL_SECONDS,
    onlineWindowSeconds: PRESENCE_ONLINE_WINDOW_SECONDS
  }, '在线状态已更新');
}));

router.post('/leave', asyncHandler(async (req, res) => {
  if (!requireStudent(req, res)) return;

  const input = presenceSchema.parse(req.body);
  const sessionId = normalizePresenceSessionId(input.sessionId);
  await endPresenceSession({ userId: req.auth!.userId, sessionId });

  return ok(res, { ended: true, sessionId }, '在线状态已结束');
}));

export default router;
