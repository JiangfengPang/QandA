export type AnnouncementItem = {
  id: string;
  title: string;
  summary: string;
  content: string[];
  category: string;
  categoryLabel?: string;
  statusLabel?: string;
  statusTone?: string;
  publishedAt: string;
  publisher: string;
  readCount?: number;
  read: boolean;
  pinned: boolean;
  isPinned?: boolean;
  isPublished?: boolean;
};

export const announcementMockItems: AnnouncementItem[] = [
  {
    id: 'ann-20260620-1',
    title: '今晚 22:30 将进行学习数据同步维护',
    summary: '维护期间答题记录会正常保存，统计面板可能延迟刷新，预计 20 分钟内恢复。',
    content: [
      '为提升学习数据统计的稳定性，系统将在今晚 22:30 至 22:50 进行短时同步维护。',
      '维护期间你仍然可以正常刷题、收藏题目和查看错题。部分统计数据可能出现延迟刷新，维护完成后会自动补齐。',
      '如果你正在进行长套题练习，建议提交当前题目后再离开页面，避免网络波动造成体验中断。'
    ],
    category: '维护',
    publishedAt: '2026-06-20 18:30',
    publisher: 'QandA 教务助手',
    read: false,
    pinned: true
  },
  {
    id: 'ann-20260618-1',
    title: '大学语文第 11 课题库已更新',
    summary: '新增课前测验与文学常识题，已同步到题库页面。',
    content: [
      '本次更新补充了大学语文第 11 课的课前测验、文学常识和章节练习题。',
      '如果你已经开始复习该章节，可以在题库页重新进入对应单元，系统会保留你的历史答题记录。'
    ],
    category: '题库',
    publishedAt: '2026-06-18 09:15',
    publisher: '题库运营',
    read: true,
    pinned: false
  },
  {
    id: 'ann-20260612-1',
    title: '端午学习打卡活动已结束',
    summary: '活动奖励将在 3 个工作日内完成统计，请留意后续消息。',
    content: [
      '端午学习打卡活动已于 6 月 12 日结束，系统正在统计连续答题和正确率数据。',
      '活动奖励会在 3 个工作日内完成发放。感谢你保持练习节奏，也欢迎继续使用错题复盘巩固薄弱点。'
    ],
    category: '活动',
    publishedAt: '2026-06-12 21:00',
    publisher: '学习运营',
    read: true,
    pinned: false
  }
];

export const latestAnnouncementMock = announcementMockItems[0];
