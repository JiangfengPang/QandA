CREATE TABLE `PracticeAnswerQueueItem` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `questionId` VARCHAR(191) NOT NULL,
  `clientAnswerId` VARCHAR(120) NOT NULL,
  `selectedJson` JSON NOT NULL,
  `durationSeconds` INTEGER NOT NULL DEFAULT 0,
  `status` VARCHAR(20) NOT NULL DEFAULT 'pending',
  `retryCount` INTEGER NOT NULL DEFAULT 0,
  `lastError` VARCHAR(500) NULL,
  `nextRunAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `lockedAt` DATETIME(3) NULL,
  `processedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `PracticeAnswerQueueItem_userId_clientAnswerId_key` (`userId`, `clientAnswerId`),
  INDEX `PracticeAnswerQueueItem_status_nextRunAt_idx` (`status`, `nextRunAt`),
  INDEX `PracticeAnswerQueueItem_lockedAt_idx` (`lockedAt`),
  INDEX `PracticeAnswerQueueItem_userId_createdAt_idx` (`userId`, `createdAt`),
  INDEX `PracticeAnswerQueueItem_questionId_idx` (`questionId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `PracticeAnswerQueueItem`
  ADD CONSTRAINT `PracticeAnswerQueueItem_userId_fkey`
  FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `PracticeAnswerQueueItem`
  ADD CONSTRAINT `PracticeAnswerQueueItem_questionId_fkey`
  FOREIGN KEY (`questionId`) REFERENCES `Question`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
