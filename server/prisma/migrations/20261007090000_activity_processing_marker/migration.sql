-- Source answers are preserved. Rebuild only derived activity totals with the business timezone.
ALTER TABLE `UserAnswer` ADD COLUMN `activityAggregatedAt` DATETIME(3) NULL;
CREATE INDEX `UserAnswer_activityAggregatedAt_createdAt_id_idx` ON `UserAnswer`(`activityAggregatedAt`, `createdAt`, `id`);
DELETE FROM `UserDailyActivityStat`;
UPDATE `ActivityAggregationCursor` SET `lastAnswerCreatedAt` = NULL, `lastAnswerId` = NULL,
  `processedCount` = 0, `lastRunAt` = NULL, `lastError` = NULL;
