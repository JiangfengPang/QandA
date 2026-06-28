type OverviewItem = {
  index: number;
  targetIndex?: number;
  indices?: number[];
  number: number;
  answered?: boolean;
  correct?: boolean;
  status?: string;
  favorite?: boolean;
  subItems?: OverviewItem[];
  question: {
    id?: unknown;
    type?: unknown;
    bankId?: unknown;
    unitId?: unknown;
    bankName?: unknown;
    unitName?: unknown;
    unitSortOrder?: unknown;
    question?: unknown;
    stem?: unknown;
    passageId?: unknown;
    readingPassage?: unknown;
  };
};

type OverviewTypeGroup = {
  type: string;
  label: string;
  items: OverviewItem[];
  hideLabel?: boolean;
};

type OverviewGroup = OverviewTypeGroup & {
  typeGroups: OverviewTypeGroup[];
};

type ReadingOverviewGroup = {
  key: string;
  title: string;
  items: OverviewItem[];
};

function questionUnitKey(question: OverviewItem['question']) {
  return String(
    question.bankId
      || question.unitId
      || question.bankName
      || question.unitName
      || 'unknown'
  );
}

function buildTypeGroups(
  items: OverviewItem[],
  questionTypeLabel: (question: OverviewItem['question']) => string
) {
  const groups = new Map<string, OverviewTypeGroup>();

  [...items]
    .sort((left, right) => left.index - right.index)
    .forEach((item) => {
      const questionType = String(item.question.type || 'single');
      const label = questionTypeLabel(item.question);
      const groupKey = `${questionType}:${label}`;

      if (!groups.has(groupKey)) {
        groups.set(groupKey, {
          type: groupKey,
          label,
          items: []
        });
      }

      groups.get(groupKey)!.items.push(item);
    });

  return Array.from(groups.values());
}

function orderedOverviewItems(items: OverviewItem[]) {
  return [...items].sort((left, right) => left.index - right.index);
}

function isConsecutiveNumberRun(items: OverviewItem[]) {
  if (items.length <= 1) return true;
  const numbers = items.map((item) => Number(item.number));
  if (numbers.some((number) => !Number.isFinite(number))) return false;

  return numbers.every((number, index) => index === 0 || number === numbers[index - 1] + 1);
}

function buildStableTypeGroups(
  items: OverviewItem[],
  questionTypeLabel: (question: OverviewItem['question']) => string
) {
  const typeGroups = buildTypeGroups(items, questionTypeLabel);
  const hasSkippedVisibleNumbers = typeGroups.some((group) => !isConsecutiveNumberRun(group.items));

  if (!hasSkippedVisibleNumbers) return typeGroups;

  return [{
    type: 'queue-order:all',
    label: '全部题目',
    items: orderedOverviewItems(items),
    hideLabel: true
  }];
}

function buildQueueOrderGroup(items: OverviewItem[]): OverviewGroup[] {
  const orderedItems = orderedOverviewItems(items);
  const typeGroup = {
    type: 'queue-order:all',
    label: '全部题目',
    items: orderedItems,
    hideLabel: true
  };

  return [{
    type: 'queue-order',
    label: '答题顺序',
    items: orderedItems,
    typeGroups: [typeGroup]
  }];
}

function normalizeOverviewText(value: unknown) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

export function isReadingOverviewItem(item: OverviewItem) {
  return String(item.question?.type || '').toLowerCase() === 'reading';
}

export function readingOverviewStemText(question: OverviewItem['question']) {
  return normalizeOverviewText(question?.question || question?.stem || question?.readingPassage || '阅读理解');
}

function readingOverviewGroupKey(item: OverviewItem) {
  const question = item.question || {};
  const unitKey = questionUnitKey(question);
  const passageId = normalizeOverviewText(question.passageId);
  if (passageId) return `reading:${unitKey}:${passageId}`;

  const stem = readingOverviewStemText(question);
  const indices = Array.isArray(item.indices) ? item.indices.join(',') : '';
  if (indices && item.indices!.length > 1) return `reading:${unitKey}:${stem}:${indices}`;

  const passage = normalizeOverviewText(question.readingPassage);
  const fallback = normalizeOverviewText(question.id) || item.index;
  if (passage) return `reading:${unitKey}:${stem}:${passage}`;
  return `reading:${unitKey}:${stem || fallback}`;
}

export function buildReadingOverviewPassageGroups(items: OverviewItem[]): ReadingOverviewGroup[] {
  const groups = new Map<string, ReadingOverviewGroup>();

  [...items]
    .sort((left, right) => left.index - right.index)
    .forEach((item) => {
      const key = readingOverviewGroupKey(item);
      if (!groups.has(key)) {
        groups.set(key, {
          key,
          title: readingOverviewStemText(item.question),
          items: []
        });
      }
      const questionItems = Array.isArray(item.subItems) && item.subItems.length ? item.subItems : [item];
      groups.get(key)!.items.push(...questionItems);
    });

  return Array.from(groups.values());
}

export function buildPracticeOverviewGroups(
  items: OverviewItem[],
  options: {
    isSubjectPractice: boolean;
    isRandomOrder: boolean;
    questionTypeLabel: (question: OverviewItem['question']) => string;
  }
): OverviewGroup[] {
  if (!options.isSubjectPractice) {
    const orderedItems = orderedOverviewItems(items);
    return [{
      type: 'practice',
      label: '答题顺序',
      items: orderedItems,
      typeGroups: buildStableTypeGroups(orderedItems, options.questionTypeLabel)
    }];
  }

  if (options.isRandomOrder) {
    return buildQueueOrderGroup(items);
  }

  const unitGroups = new Map<string, {
    type: string;
    label: string;
    order: number;
    items: OverviewItem[];
  }>();

  [...items]
    .sort((left, right) => left.index - right.index)
    .forEach((item) => {
      const question = item.question || {};
      const unitId = questionUnitKey(question);
      const unitName = String(question.unitName || question.bankName || '未命名单元');
      const unitOrder = Number.isFinite(Number(question.unitSortOrder))
        ? Number(question.unitSortOrder)
        : Number.MAX_SAFE_INTEGER;
      const groupKey = `unit:${unitId}`;

      if (!unitGroups.has(groupKey)) {
        unitGroups.set(groupKey, {
          type: groupKey,
          label: unitName,
          order: unitOrder,
          items: []
        });
      }

      unitGroups.get(groupKey)!.items.push(item);
    });

  return Array.from(unitGroups.values())
    .sort((left, right) => {
      const leftFirst = left.items[0]?.index ?? Number.MAX_SAFE_INTEGER;
      const rightFirst = right.items[0]?.index ?? Number.MAX_SAFE_INTEGER;

      if (options.isRandomOrder) return leftFirst - rightFirst;
      if (left.order !== right.order) return left.order - right.order;
      return leftFirst - rightFirst;
    })
    .map(({ order: _order, ...group }) => {
      const unitItems = [...group.items].sort((left, right) => left.index - right.index);
      return {
        ...group,
        items: unitItems,
        typeGroups: buildStableTypeGroups(unitItems, options.questionTypeLabel)
      };
    });
}
