type PracticeQuestionLike = {
  bankId?: unknown;
  unitId?: unknown;
  bankName?: unknown;
  unitName?: unknown;
};

function questionUnitKey(question: PracticeQuestionLike | null | undefined) {
  return String(
    question?.bankId
      || question?.unitId
      || question?.bankName
      || question?.unitName
      || '__all__'
  );
}

export function practiceProgressNumber(currentIndex: number, questionCount: number) {
  if (questionCount <= 0) return 0;
  return Math.min(Math.max(currentIndex + 1, 1), questionCount);
}

export function practiceProgressPercent(currentIndex: number, questionCount: number) {
  if (questionCount <= 0) return 0;
  return Math.round((practiceProgressNumber(currentIndex, questionCount) / questionCount) * 100);
}

export function canGoToPreviousQuestion(currentIndex: number) {
  return currentIndex > 0;
}

export function getUnitQueueProgress(
  questions: PracticeQuestionLike[],
  currentIndex: number
) {
  const currentQuestion = questions[currentIndex];
  if (!currentQuestion) return null;

  const currentUnitKey = questionUnitKey(currentQuestion);
  let current = 0;
  let total = 0;

  questions.forEach((question, index) => {
    if (questionUnitKey(question) !== currentUnitKey) return;
    total += 1;
    if (index <= currentIndex) current += 1;
  });

  return { current, total };
}
