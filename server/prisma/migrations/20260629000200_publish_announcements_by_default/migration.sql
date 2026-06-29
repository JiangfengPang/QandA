UPDATE `Announcement`
SET
  `isPublished` = true,
  `statusLabel` = '已发布',
  `statusTone` = 'success',
  `publishedAt` = COALESCE(`publishedAt`, `createdAt`)
WHERE `isPublished` = false;

ALTER TABLE `Announcement`
  MODIFY `isPublished` BOOLEAN NOT NULL DEFAULT true;
