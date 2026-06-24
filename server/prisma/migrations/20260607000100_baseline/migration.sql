-- QandA production baseline migration
-- Generated for MySQL 8.x from prisma/schema.prisma

CREATE TABLE `User` (
  `id` VARCHAR(191) NOT NULL,
  `username` VARCHAR(64) NOT NULL,
  `passwordHash` VARCHAR(191) NOT NULL,
  `nickname` VARCHAR(80) NOT NULL,
  `email` VARCHAR(191) NULL,
  `avatarUrl` VARCHAR(500) NULL,
  `role` ENUM('STUDENT', 'ADMIN') NOT NULL DEFAULT 'STUDENT',
  `isActive` BOOLEAN NOT NULL DEFAULT true,
  `autoShowExplanation` BOOLEAN NOT NULL DEFAULT true,
  `autoAddWrong` BOOLEAN NOT NULL DEFAULT true,
  `questionFontSize` VARCHAR(20) NOT NULL DEFAULT 'standard',
  `showQuestionOverview` BOOLEAN NOT NULL DEFAULT true,
  `resetCodeHash` VARCHAR(191) NULL,
  `resetCodeExpiresAt` DATETIME(3) NULL,
  `resetCodeAttempts` INTEGER NOT NULL DEFAULT 0,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `User_username_key` (`username`),
  UNIQUE INDEX `User_email_key` (`email`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `Subject` (
  `id` VARCHAR(191) NOT NULL,
  `legacyId` VARCHAR(80) NULL,
  `name` VARCHAR(120) NOT NULL,
  `description` TEXT NULL,
  `color` VARCHAR(32) NULL,
  `sortOrder` INTEGER NOT NULL DEFAULT 0,
  `isActive` BOOLEAN NOT NULL DEFAULT true,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `Subject_legacyId_key` (`legacyId`),
  INDEX `Subject_name_idx` (`name`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `Bank` (
  `id` VARCHAR(191) NOT NULL,
  `subjectId` VARCHAR(191) NOT NULL,
  `legacyId` VARCHAR(100) NULL,
  `name` VARCHAR(180) NOT NULL,
  `description` TEXT NULL,
  `sourceFile` VARCHAR(255) NULL,
  `sortOrder` INTEGER NOT NULL DEFAULT 0,
  `isActive` BOOLEAN NOT NULL DEFAULT true,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `Bank_subjectId_legacyId_key` (`subjectId`, `legacyId`),
  INDEX `Bank_subjectId_idx` (`subjectId`),
  INDEX `Bank_name_idx` (`name`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `Question` (
  `id` VARCHAR(191) NOT NULL,
  `bankId` VARCHAR(191) NOT NULL,
  `legacyId` VARCHAR(120) NULL,
  `type` VARCHAR(30) NOT NULL,
  `typeLabel` VARCHAR(40) NULL,
  `difficulty` VARCHAR(30) NULL,
  `score` DOUBLE NOT NULL DEFAULT 0,
  `stem` TEXT NOT NULL,
  `answerJson` JSON NOT NULL,
  `tagsJson` JSON NULL,
  `explanation` TEXT NULL,
  `rawJson` JSON NULL,
  `sortOrder` INTEGER NOT NULL DEFAULT 0,
  `isActive` BOOLEAN NOT NULL DEFAULT true,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  INDEX `Question_bankId_idx` (`bankId`),
  INDEX `Question_type_idx` (`type`),
  INDEX `Question_legacyId_idx` (`legacyId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `QuestionOption` (
  `id` VARCHAR(191) NOT NULL,
  `questionId` VARCHAR(191) NOT NULL,
  `label` VARCHAR(20) NOT NULL,
  `content` TEXT NOT NULL,
  `isCorrect` BOOLEAN NOT NULL DEFAULT false,
  `sortOrder` INTEGER NOT NULL DEFAULT 0,
  INDEX `QuestionOption_questionId_idx` (`questionId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `UserAnswer` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `questionId` VARCHAR(191) NOT NULL,
  `selectedJson` JSON NOT NULL,
  `isCorrect` BOOLEAN NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `UserAnswer_userId_createdAt_idx` (`userId`, `createdAt`),
  INDEX `UserAnswer_questionId_idx` (`questionId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `UserFavorite` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `questionId` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `UserFavorite_userId_questionId_key` (`userId`, `questionId`),
  INDEX `UserFavorite_questionId_idx` (`questionId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `WrongQuestion` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `questionId` VARCHAR(191) NOT NULL,
  `wrongCount` INTEGER NOT NULL DEFAULT 1,
  `lastAnsweredAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `WrongQuestion_userId_questionId_key` (`userId`, `questionId`),
  INDEX `WrongQuestion_questionId_idx` (`questionId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `EmailVerificationCode` (
  `id` VARCHAR(191) NOT NULL,
  `email` VARCHAR(191) NOT NULL,
  `purpose` VARCHAR(40) NOT NULL,
  `codeHash` VARCHAR(191) NOT NULL,
  `attempts` INTEGER NOT NULL DEFAULT 0,
  `expiresAt` DATETIME(3) NOT NULL,
  `consumedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `EmailVerificationCode_email_purpose_idx` (`email`, `purpose`),
  INDEX `EmailVerificationCode_expiresAt_idx` (`expiresAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `Bank` ADD CONSTRAINT `Bank_subjectId_fkey` FOREIGN KEY (`subjectId`) REFERENCES `Subject`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `Question` ADD CONSTRAINT `Question_bankId_fkey` FOREIGN KEY (`bankId`) REFERENCES `Bank`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `QuestionOption` ADD CONSTRAINT `QuestionOption_questionId_fkey` FOREIGN KEY (`questionId`) REFERENCES `Question`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `UserAnswer` ADD CONSTRAINT `UserAnswer_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `UserAnswer` ADD CONSTRAINT `UserAnswer_questionId_fkey` FOREIGN KEY (`questionId`) REFERENCES `Question`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `UserFavorite` ADD CONSTRAINT `UserFavorite_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `UserFavorite` ADD CONSTRAINT `UserFavorite_questionId_fkey` FOREIGN KEY (`questionId`) REFERENCES `Question`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `WrongQuestion` ADD CONSTRAINT `WrongQuestion_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `WrongQuestion` ADD CONSTRAINT `WrongQuestion_questionId_fkey` FOREIGN KEY (`questionId`) REFERENCES `Question`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
