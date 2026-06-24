export type PracticeSessionRecord = {
  correct: boolean;
  userAnswer: string[];
  answer: string[];
  explanation: string;
  clientAnswerId?: string;
  syncStatus?: 'pending' | 'synced' | 'failed';
};

export type PracticePreferences = {
  autoShowExplanation: boolean;
  autoAddWrong: boolean;
  autoAdvanceOnCorrect: boolean;
  questionFontSize: 'small' | 'standard' | 'large' | string;
  showQuestionOverview: boolean;
};
