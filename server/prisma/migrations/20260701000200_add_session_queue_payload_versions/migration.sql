ALTER TABLE `PracticeAnswerSubmissionQueue`
  ADD COLUMN `payloadVersion` INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN `processedPayloadVersion` INTEGER NOT NULL DEFAULT 0;
