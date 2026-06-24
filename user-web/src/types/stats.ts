export type DailyTrend = {
  date: string;
  label: string;
  answerCount: number;
  correctCount: number;
  accuracy: number;
};


export type SubjectOverview = {
  notStarted: number;
  inProgress: number;
  completed: number;
};

export type RecentBank = {
  id: string;
  subjectId?: string;
  subjectName?: string;
  name: string;
  questionCount: number;
  lastAnsweredAt?: string;
};

export type SubjectStat = {
  id: string;
  name: string;
  totalQuestionCount: number;
  answerCount: number;
  correctCount: number;
  wrongCount?: number;
  accuracy: number;
  wrongQuestionCount: number;
  favoriteCount: number;
};

export type StatsPayload = {
  totalQuestionCount: number;
  subjectCount: number;
  bankCount: number;
  answerCount: number;
  answerRecordCount: number;
  correctCount: number;
  wrongCount: number;
  accuracy: number;
  favoriteCount: number;
  wrongQuestionCount: number;
  totalDurationSeconds: number;
  dailyTrend: DailyTrend[];
  subjectStats: SubjectStat[];
  weakSubjects: SubjectStat[];
  subjectOverview: SubjectOverview;
  recentBank: RecentBank | null;
};

export type LearningAdvice = {
  type: 'danger' | 'warn' | 'blue' | 'ok';
  icon: string;
  title: string;
  desc: string;
};

export const defaultStatsPayload = (): StatsPayload => ({
  totalQuestionCount: 0,
  subjectCount: 0,
  bankCount: 0,
  answerCount: 0,
  answerRecordCount: 0,
  correctCount: 0,
  wrongCount: 0,
  accuracy: 0,
  favoriteCount: 0,
  wrongQuestionCount: 0,
  totalDurationSeconds: 0,
  dailyTrend: [],
  subjectStats: [],
  weakSubjects: [],
  subjectOverview: { notStarted: 0, inProgress: 0, completed: 0 },
  recentBank: null
});
