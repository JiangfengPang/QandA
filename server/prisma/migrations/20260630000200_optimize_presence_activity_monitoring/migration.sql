CREATE INDEX `UserPresenceSession_endedAt_lastSeenAt_userId_idx`
  ON `UserPresenceSession`(`endedAt`, `lastSeenAt`, `userId`);
