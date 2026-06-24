CREATE TABLE `Announcement` (
  `id` VARCHAR(191) NOT NULL,
  `title` VARCHAR(160) NOT NULL,
  `summary` VARCHAR(300) NOT NULL,
  `contentJson` JSON NOT NULL,
  `categoryLabel` VARCHAR(40) NOT NULL,
  `statusLabel` VARCHAR(40) NOT NULL DEFAULT '已发布',
  `statusTone` VARCHAR(20) NOT NULL DEFAULT 'success',
  `publisher` VARCHAR(80) NOT NULL DEFAULT 'QandA 教务助手',
  `isPublished` BOOLEAN NOT NULL DEFAULT false,
  `isPinned` BOOLEAN NOT NULL DEFAULT false,
  `publishedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`),
  INDEX `Announcement_isPublished_isPinned_publishedAt_idx` (`isPublished`, `isPinned`, `publishedAt`),
  INDEX `Announcement_categoryLabel_idx` (`categoryLabel`),
  INDEX `Announcement_statusLabel_idx` (`statusLabel`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `AnnouncementRead` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `announcementId` VARCHAR(191) NOT NULL,
  `readAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`),
  UNIQUE INDEX `AnnouncementRead_userId_announcementId_key` (`userId`, `announcementId`),
  INDEX `AnnouncementRead_announcementId_idx` (`announcementId`),
  INDEX `AnnouncementRead_userId_readAt_idx` (`userId`, `readAt`),
  CONSTRAINT `AnnouncementRead_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `AnnouncementRead_announcementId_fkey` FOREIGN KEY (`announcementId`) REFERENCES `Announcement`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `Announcement`
  (`id`, `title`, `summary`, `contentJson`, `categoryLabel`, `statusLabel`, `statusTone`, `publisher`, `isPublished`, `isPinned`, `publishedAt`, `createdAt`, `updatedAt`)
VALUES
  (
    'ann_20260620_1',
    '今晚 22:30 将进行学习数据同步维护',
    '维护期间答题记录会正常保存，统计面板可能延迟刷新，预计 20 分钟内恢复。',
    JSON_ARRAY(
      '为提升学习数据统计的稳定性，系统将在今晚 22:30 至 22:50 进行短时同步维护。',
      '维护期间你仍然可以正常刷题、收藏题目和查看错题。部分统计数据可能出现延迟刷新，维护完成后会自动补齐。',
      '如果你正在进行长套题练习，建议提交当前题目后再离开页面，避免网络波动造成体验中断。'
    ),
    '维护',
    '已发布',
    'success',
    'QandA 教务助手',
    true,
    true,
    '2026-06-20 18:30:00.000',
    CURRENT_TIMESTAMP(3),
    CURRENT_TIMESTAMP(3)
  ),
  (
    'ann_20260618_1',
    '大学语文第 11 课题库已更新',
    '新增课前测验与文学常识题，已同步到题库页面。',
    JSON_ARRAY(
      '本次更新补充了大学语文第 11 课的课前测验、文学常识和章节练习题。',
      '如果你已经开始复习该章节，可以在题库页重新进入对应单元，系统会保留你的历史答题记录。'
    ),
    '题库',
    '已发布',
    'success',
    '题库运营',
    true,
    false,
    '2026-06-18 09:15:00.000',
    CURRENT_TIMESTAMP(3),
    CURRENT_TIMESTAMP(3)
  ),
  (
    'ann_20260612_1',
    '端午学习打卡活动已结束',
    '活动奖励将在 3 个工作日内完成统计，请留意后续消息。',
    JSON_ARRAY(
      '端午学习打卡活动已于 6 月 12 日结束，系统正在统计连续答题和正确率数据。',
      '活动奖励会在 3 个工作日内完成发放。感谢你保持练习节奏，也欢迎继续使用错题复盘巩固薄弱点。'
    ),
    '活动',
    '已发布',
    'success',
    '学习运营',
    true,
    false,
    '2026-06-12 21:00:00.000',
    CURRENT_TIMESTAMP(3),
    CURRENT_TIMESTAMP(3)
  );
