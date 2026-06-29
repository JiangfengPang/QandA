CREATE TABLE `UserPresenceSession` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `sessionId` VARCHAR(120) NOT NULL,
  `userAgent` VARCHAR(500) NULL,
  `ipAddress` VARCHAR(80) NULL,
  `lastSeenAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `endedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `UserPresenceSession_userId_sessionId_key`(`userId`, `sessionId`),
  INDEX `UserPresenceSession_lastSeenAt_idx`(`lastSeenAt`),
  INDEX `UserPresenceSession_endedAt_lastSeenAt_idx`(`endedAt`, `lastSeenAt`),
  INDEX `UserPresenceSession_userId_lastSeenAt_idx`(`userId`, `lastSeenAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `UserPresenceSession`
  ADD CONSTRAINT `UserPresenceSession_userId_fkey`
  FOREIGN KEY (`userId`) REFERENCES `User`(`id`)
  ON DELETE CASCADE ON UPDATE CASCADE;
