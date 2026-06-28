export function needsManualAnswerConfirm(questionType: unknown, submitted: boolean) {
  const type = String(questionType || '').toLowerCase();
  return !submitted && (type === 'multiple' || type === 'fill');
}

export function shouldSubmitChoiceImmediately(questionType: unknown) {
  return String(questionType || '').toLowerCase() !== 'multiple';
}

export function canAutoAdvanceAfterCorrectAnswer(options: {
  autoAdvanceOnCorrect: boolean;
  currentIndex: number;
  questionCount: number;
}) {
  return (
    options.autoAdvanceOnCorrect
    && options.questionCount > 0
    && options.currentIndex >= 0
    && options.currentIndex < options.questionCount - 1
  );
}
