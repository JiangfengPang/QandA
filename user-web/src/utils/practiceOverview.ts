type OverviewItem = {
  index: number;
  number: number;
  answered?: boolean;
  correct?: boolean;
  status?: string;
  favorite?: boolean;
  question: {
    type?: string;
    bankId?: unknown;
    unitId?: unknown;
    bankName?: unknown;
    unitName?: unknown;
    unitSortOrder?: unknown;
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
      const questionType = item.question.type || 'single';
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

function buildQueueOrderGroup(items: OverviewItem[]): OverviewGroup[] {
  const orderedItems = [...items].sort((left, right) => left.index - right.index);
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

export function buildPracticeOverviewGroups(
  items: OverviewItem[],
  options: {
    isSubjectPractice: boolean;
    isRandomOrder: boolean;
    questionTypeLabel: (question: OverviewItem['question']) => string;
  }
): OverviewGroup[] {
  if (!options.isSubjectPractice) {
    return buildTypeGroups(items, options.questionTypeLabel).map((group) => ({
      ...group,
      typeGroups: [{ ...group }]
    }));
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
        typeGroups: buildTypeGroups(unitItems, options.questionTypeLabel)
      };
    });
}
