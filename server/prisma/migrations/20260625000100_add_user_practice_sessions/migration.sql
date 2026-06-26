CREATE TABLE `UserPracticeSession` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `sessionKey` VARCHAR(191) NOT NULL,
  `payloadJson` JSON NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`),
  UNIQUE INDEX `UserPracticeSession_userId_sessionKey_key` (`userId`, `sessionKey`),
  INDEX `UserPracticeSession_userId_updatedAt_idx` (`userId`, `updatedAt`),
  CONSTRAINT `UserPracticeSession_userId_fkey`
    FOREIGN KEY (`userId`) REFERENCES `User`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
