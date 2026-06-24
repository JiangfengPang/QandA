-- Store real per-answer active dwell time reported by the practice page.
-- Existing rows default to 0 because older records did not capture duration.
ALTER TABLE `UserAnswer` ADD COLUMN `durationSeconds` INTEGER NOT NULL DEFAULT 0;
