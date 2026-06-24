ALTER TABLE `User`
  ADD COLUMN `lastActiveAt` DATETIME(3) NULL;

CREATE INDEX `User_role_lastActiveAt_idx`
  ON `User`(`role`, `lastActiveAt`);

CREATE TABLE `AdminOperationLog` (
  `id` VARCHAR(191) NOT NULL,
  `adminId` VARCHAR(191) NOT NULL,
  `action` VARCHAR(60) NOT NULL,
  `summary` VARCHAR(255) NOT NULL,
  `method` VARCHAR(10) NOT NULL,
  `path` VARCHAR(255) NOT NULL,
  `targetType` VARCHAR(60) NULL,
  `targetId` VARCHAR(191) NULL,
  `ipAddress` VARCHAR(80) NULL,
  `userAgent` VARCHAR(500) NULL,
  `statusCode` INTEGER NOT NULL,
  `durationMs` INTEGER NOT NULL,
  `detailsJson` JSON NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `AdminOperationLog_adminId_createdAt_idx` (`adminId`, `createdAt`),
  INDEX `AdminOperationLog_action_createdAt_idx` (`action`, `createdAt`),
  INDEX `AdminOperationLog_createdAt_idx` (`createdAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `AdminOperationLog`
  ADD CONSTRAINT `AdminOperationLog_adminId_fkey`
  FOREIGN KEY (`adminId`) REFERENCES `User`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;
