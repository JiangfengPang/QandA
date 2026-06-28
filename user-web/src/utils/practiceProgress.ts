type PracticeQuestionLike = {
  id?: unknown;
  type?: unknown;
  bankId?: unknown;
  unitId?: unknown;
  bankName?: unknown;
  unitName?: unknown;
  question?: unknown;
  stem?: unknown;
  passageId?: unknown;
  readingPassage?: unknown;
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

function normalizeDisplayKeyPart(value: unknown) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

export function questionDisplayKey(question: PracticeQuestionLike | null | undefined, index = 0) {
  if (!question) return `missing:${index}`;
  const id = normalizeDisplayKeyPart(question.id);
  if (String(question.type || '').toLowerCase() !== 'reading') return `question:${id || index}`;

  const unitKey = questionUnitKey(question);
  const passageId = normalizeDisplayKeyPart(question.passageId);
  const readingPassage = normalizeDisplayKeyPart(question.readingPassage);
  const stem = normalizeDisplayKeyPart(question.question || question.stem);
  return `reading:${unitKey}:${passageId || readingPassage || stem || id || index}`;
}

export function getQuestionDisplayGroups(questions: PracticeQuestionLike[]) {
  const groups: Array<{
    key: string;
    number: number;
    firstIndex: number;
    indices: number[];
    question: PracticeQuestionLike;
  }> = [];
  const groupByKey = new Map<string, (typeof groups)[number]>();

  questions.forEach((question, index) => {
    const key = questionDisplayKey(question, index);
    let group = groupByKey.get(key);
    if (!group) {
      group = {
        key,
        number: groups.length + 1,
        firstIndex: index,
        indices: [],
        question
      };
      groupByKey.set(key, group);
      groups.push(group);
    }
    group.indices.push(index);
  });

  return groups;
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

export function getQuestionDisplayProgress(
  questions: PracticeQuestionLike[],
  currentIndex: number
) {
  const groups = getQuestionDisplayGroups(questions);
  if (!groups.length) return { current: 0, total: 0, group: null as null | (typeof groups)[number] };
  const group = groups.find((item) => item.indices.includes(currentIndex)) || groups[0];
  return { current: group.number, total: groups.length, group };
}

export function getQuestionDisplayProgressPercent(
  questions: PracticeQuestionLike[],
  currentIndex: number
) {
  const progress = getQuestionDisplayProgress(questions, currentIndex);
  if (progress.total <= 0) return 0;
  return Math.round((progress.current / progress.total) * 100);
}

export function getReadingSubQuestionProgress(
  questions: PracticeQuestionLike[],
  currentIndex: number
) {
  const question = questions[currentIndex];
  if (String(question?.type || '').toLowerCase() !== 'reading') return { current: 1, total: 1 };

  const key = questionDisplayKey(question, currentIndex);
  const indices = questions
    .map((item, index) => ({ item, index }))
    .filter(({ item, index }) => questionDisplayKey(item, index) === key)
    .map(({ index }) => index);
  const current = Math.max(indices.indexOf(currentIndex) + 1, 1);
  return { current, total: Math.max(indices.length, 1) };
}

export function getUnitQueueProgress(
  questions: PracticeQuestionLike[],
  currentIndex: number
) {
  const currentQuestion = questions[currentIndex];
  if (!currentQuestion) return null;

  const currentUnitKey = questionUnitKey(currentQuestion);
  const currentDisplayProgress = getQuestionDisplayProgress(questions, currentIndex);
  let current = 0;
  let total = 0;

  getQuestionDisplayGroups(questions).forEach((group) => {
    const question = group.question;
    if (questionUnitKey(question) !== currentUnitKey) return;
    total += 1;
    if (group.number <= currentDisplayProgress.current) current += 1;
  });

  return { current, total };
}
