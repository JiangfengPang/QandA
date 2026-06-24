-- Make answer submissions idempotent so client retries cannot duplicate records.
ALTER TABLE `UserAnswer`
  ADD COLUMN `clientAnswerId` VARCHAR(120) NULL;

CREATE UNIQUE INDEX `UserAnswer_userId_clientAnswerId_key`
  ON `UserAnswer`(`userId`, `clientAnswerId`);
