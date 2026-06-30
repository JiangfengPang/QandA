CREATE TABLE `SystemSetting` (
  `id` VARCHAR(32) NOT NULL,
  `userLoginDisabled` BOOLEAN NOT NULL DEFAULT false,
  `userLoginDisabledUpdatedAt` DATETIME(3) NULL,
  `userForceLogoutAt` DATETIME(3) NULL,
  `practiceAnswerWorkerPaused` BOOLEAN NOT NULL DEFAULT false,
  `practiceAnswerWorkerPausedUpdatedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `PracticeSession` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `scopeType` VARCHAR(40) NOT NULL DEFAULT 'practice',
  `scopeId` VARCHAR(191) NULL,
  `status` VARCHAR(20) NOT NULL DEFAULT 'in_progress',
  `answerCount` INTEGER NOT NULL DEFAULT 0,
  `correctCount` INTEGER NOT NULL DEFAULT 0,
  `durationSeconds` INTEGER NOT NULL DEFAULT 0,
  `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `submittedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  INDEX `PracticeSession_userId_createdAt_idx` (`userId`, `createdAt`),
  INDEX `PracticeSession_userId_status_idx` (`userId`, `status`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `PracticeAnswerSubmissionQueue` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `practiceSessionId` VARCHAR(191) NOT NULL,
  `clientSubmissionId` VARCHAR(120) NOT NULL,
  `answersJson` JSON NOT NULL,
  `status` VARCHAR(20) NOT NULL DEFAULT 'pending',
  `retryCount` INTEGER NOT NULL DEFAULT 0,
  `lastError` VARCHAR(500) NULL,
  `nextRunAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `lockedAt` DATETIME(3) NULL,
  `processedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `PracticeAnswerSubmissionQueue_userId_practiceSessionId_key` (`userId`, `practiceSessionId`),
  UNIQUE INDEX `PracticeAnswerSubmissionQueue_userId_clientSubmissionId_key` (`userId`, `clientSubmissionId`),
  INDEX `PracticeAnswerSubmissionQueue_status_nextRunAt_idx` (`status`, `nextRunAt`),
  INDEX `PracticeAnswerSubmissionQueue_lockedAt_idx` (`lockedAt`),
  INDEX `PracticeAnswerSubmissionQueue_userId_createdAt_idx` (`userId`, `createdAt`),
  INDEX `PracticeAnswerSubmissionQueue_practiceSessionId_idx` (`practiceSessionId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `PracticeSession`
  ADD CONSTRAINT `PracticeSession_userId_fkey`
  FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `PracticeAnswerSubmissionQueue`
  ADD CONSTRAINT `PracticeAnswerSubmissionQueue_userId_fkey`
  FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `PracticeAnswerSubmissionQueue`
  ADD CONSTRAINT `PracticeAnswerSubmissionQueue_practiceSessionId_fkey`
  FOREIGN KEY (`practiceSessionId`) REFERENCES `PracticeSession`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
