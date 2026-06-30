CREATE TABLE `UserDailyActivityStat` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `activityDate` DATE NOT NULL,
  `answerCount` INTEGER NOT NULL DEFAULT 0,
  `correctCount` INTEGER NOT NULL DEFAULT 0,
  `durationSeconds` INTEGER NOT NULL DEFAULT 0,
  `firstAnsweredAt` DATETIME(3) NULL,
  `lastAnsweredAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `UserDailyActivityStat_userId_activityDate_key` (`userId`, `activityDate`),
  INDEX `UserDailyActivityStat_activityDate_idx` (`activityDate`),
  INDEX `UserDailyActivityStat_activityDate_userId_idx` (`activityDate`, `userId`),
  INDEX `UserDailyActivityStat_activityDate_answerCount_idx` (`activityDate`, `answerCount`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ActivityAggregationCursor` (
  `id` VARCHAR(64) NOT NULL,
  `lastAnswerCreatedAt` DATETIME(3) NULL,
  `lastAnswerId` VARCHAR(191) NULL,
  `processedCount` INTEGER NOT NULL DEFAULT 0,
  `lastRunAt` DATETIME(3) NULL,
  `lastError` VARCHAR(500) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `UserAnswer_createdAt_id_idx`
  ON `UserAnswer`(`createdAt`, `id`);

ALTER TABLE `UserDailyActivityStat`
  ADD CONSTRAINT `UserDailyActivityStat_userId_fkey`
  FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO `UserDailyActivityStat` (
  `id`,
  `userId`,
  `activityDate`,
  `answerCount`,
  `correctCount`,
  `durationSeconds`,
  `firstAnsweredAt`,
  `lastAnsweredAt`,
  `createdAt`,
  `updatedAt`
)
SELECT
  UUID(),
  a.`userId`,
  DATE(a.`createdAt`) AS `activityDate`,
  COUNT(*) AS `answerCount`,
  SUM(CASE WHEN a.`isCorrect` = 1 THEN 1 ELSE 0 END) AS `correctCount`,
  COALESCE(SUM(a.`durationSeconds`), 0) AS `durationSeconds`,
  MIN(a.`createdAt`) AS `firstAnsweredAt`,
  MAX(a.`createdAt`) AS `lastAnsweredAt`,
  CURRENT_TIMESTAMP(3),
  CURRENT_TIMESTAMP(3)
FROM `UserAnswer` a
WHERE a.`createdAt` >= DATE_SUB(CURRENT_DATE(), INTERVAL 29 DAY)
GROUP BY a.`userId`, DATE(a.`createdAt`);

INSERT INTO `ActivityAggregationCursor` (
  `id`,
  `lastAnswerCreatedAt`,
  `lastAnswerId`,
  `processedCount`,
  `lastRunAt`,
  `lastError`,
  `createdAt`,
  `updatedAt`
)
SELECT
  'default',
  latest.`createdAt`,
  latest.`id`,
  (SELECT COUNT(*) FROM `UserAnswer`),
  CURRENT_TIMESTAMP(3),
  NULL,
  CURRENT_TIMESTAMP(3),
  CURRENT_TIMESTAMP(3)
FROM (
  SELECT `id`, `createdAt`
  FROM `UserAnswer`
  ORDER BY `createdAt` DESC, `id` DESC
  LIMIT 1
) latest;
