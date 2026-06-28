import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPracticeOverviewGroups, buildReadingOverviewPassageGroups } from '../src/utils/practiceOverview';

const typeLabel = (question: { type?: string }) => ({
  single: '单选',
  multiple: '多选',
  judge: '判断题'
}[question.type || 'single'] || '其他');

function assertNoSkippedVisibleNumbers(groups: ReturnType<typeof buildPracticeOverviewGroups>) {
  groups.forEach((group) => {
    group.typeGroups.forEach((typeGroup) => {
      const numbers = typeGroup.items.map((item) => item.number);
      numbers.forEach((number, index) => {
        if (index > 0) assert.equal(number, numbers[index - 1] + 1);
      });
    });
  });
}

test('sequence overview keeps queue numbering and puts the first queue type first', () => {
  const items = [
    ...Array.from({ length: 16 }, (_, index) => ({
      index,
      number: index + 1,
      question: { bankId: 'unit-1', unitName: '第一章', unitSortOrder: 0, type: 'judge' }
    })),
    ...Array.from({ length: 18 }, (_, index) => ({
      index: index + 16,
      number: index + 17,
      question: { bankId: 'unit-1', unitName: '第一章', unitSortOrder: 0, type: 'single' }
    }))
  ];

  const [group] = buildPracticeOverviewGroups(items, {
    isSubjectPractice: true,
    isRandomOrder: false,
    questionTypeLabel: typeLabel
  });

  assert.equal(group.typeGroups[0].label, '判断题');
  assert.equal(group.typeGroups[0].items[0].number, 1);
  assert.equal(group.typeGroups[1].label, '单选');
  assert.equal(group.typeGroups[1].items[0].number, 17);
  assertNoSkippedVisibleNumbers([group]);
});

test('interleaved subject overview falls back to queue order to avoid skipped visible numbers', () => {
  const items = [
    { index: 0, number: 1, question: { bankId: 'unit-1', unitName: '客观题题库', unitSortOrder: 0, type: 'single' } },
    { index: 1, number: 2, question: { bankId: 'unit-1', unitName: '客观题题库', unitSortOrder: 0, type: 'multiple' } },
    { index: 2, number: 3, question: { bankId: 'unit-1', unitName: '客观题题库', unitSortOrder: 0, type: 'single' } },
    { index: 3, number: 4, question: { bankId: 'unit-1', unitName: '客观题题库', unitSortOrder: 0, type: 'single' } },
    { index: 4, number: 5, question: { bankId: 'unit-1', unitName: '客观题题库', unitSortOrder: 0, type: 'judge' } },
    { index: 5, number: 6, question: { bankId: 'unit-1', unitName: '客观题题库', unitSortOrder: 0, type: 'multiple' } }
  ];

  const [group] = buildPracticeOverviewGroups(items, {
    isSubjectPractice: true,
    isRandomOrder: false,
    questionTypeLabel: typeLabel
  });

  assert.equal(group.label, '客观题题库');
  assert.equal(group.typeGroups.length, 1);
  assert.equal(group.typeGroups[0].hideLabel, true);
  assert.deepEqual(group.typeGroups[0].items.map((item) => item.number), [1, 2, 3, 4, 5, 6]);
  assertNoSkippedVisibleNumbers([group]);
});

test('bank overview also avoids skipped visible numbers when question types are interleaved', () => {
  const items = [
    { index: 0, number: 1, question: { bankId: 'bank-1', bankName: '混合题库', type: 'single' } },
    { index: 1, number: 2, question: { bankId: 'bank-1', bankName: '混合题库', type: 'multiple' } },
    { index: 2, number: 3, question: { bankId: 'bank-1', bankName: '混合题库', type: 'single' } },
    { index: 3, number: 4, question: { bankId: 'bank-1', bankName: '混合题库', type: 'judge' } }
  ];

  const [group] = buildPracticeOverviewGroups(items, {
    isSubjectPractice: false,
    isRandomOrder: false,
    questionTypeLabel: typeLabel
  });

  assert.equal(group.label, '答题顺序');
  assert.equal(group.typeGroups.length, 1);
  assert.equal(group.typeGroups[0].hideLabel, true);
  assert.deepEqual(group.typeGroups[0].items.map((item) => item.number), [1, 2, 3, 4]);
  assertNoSkippedVisibleNumbers([group]);
});

test('random subject overview displays question numbers in queue order', () => {
  const items = [
    { index: 0, number: 1, question: { bankId: 'unit-2', unitName: '第二章', unitSortOrder: 1, type: 'multiple' } },
    { index: 1, number: 2, question: { bankId: 'unit-1', unitName: '第一章', unitSortOrder: 0, type: 'judge' } },
    { index: 2, number: 3, question: { bankId: 'unit-2', unitName: '第二章', unitSortOrder: 1, type: 'single' } },
    { index: 3, number: 4, question: { bankId: 'unit-1', unitName: '第一章', unitSortOrder: 0, type: 'multiple' } }
  ];

  const groups = buildPracticeOverviewGroups(items, {
    isSubjectPractice: true,
    isRandomOrder: true,
    questionTypeLabel: typeLabel
  });

  assert.equal(groups.length, 1);
  assert.equal(groups[0].label, '答题顺序');
  assert.deepEqual(groups[0].items.map((item) => item.number), [1, 2, 3, 4]);
  assert.deepEqual(groups[0].typeGroups[0].items.map((item) => item.number), [1, 2, 3, 4]);
  assert.deepEqual(groups[0].typeGroups[0].items.map((item) => item.index), [0, 1, 2, 3]);
  assert.equal(groups[0].typeGroups[0].hideLabel, true);
});

test('reading overview groups sub questions under the shared passage stem', () => {
  const items = [
    {
      index: 0,
      number: 1,
      question: {
        bankId: 'reading-unit',
        type: 'reading',
        question: 'Passage One. Read the passage and choose the best answer.',
        readingQuestion: 'Question 1'
      }
    },
    {
      index: 1,
      number: 2,
      question: {
        bankId: 'reading-unit',
        type: 'reading',
        question: 'Passage One. Read the passage and choose the best answer.',
        readingQuestion: 'Question 2'
      }
    },
    {
      index: 2,
      number: 3,
      question: {
        bankId: 'reading-unit',
        type: 'reading',
        question: 'Passage Two. Read the passage and choose the best answer.',
        readingQuestion: 'Question 1'
      }
    }
  ];

  const groups = buildReadingOverviewPassageGroups(items);

  assert.equal(groups.length, 2);
  assert.equal(groups[0].title, 'Passage One. Read the passage and choose the best answer.');
  assert.deepEqual(groups[0].items.map((item) => item.number), [1, 2]);
  assert.deepEqual(groups[1].items.map((item) => item.number), [3]);
});

test('reading overview keeps distinct passages separate when stems match', () => {
  const items = [
    {
      index: 0,
      number: 1,
      question: {
        bankId: 'reading-unit',
        type: 'reading',
        question: 'Read the passage and choose the best answer.',
        readingPassage: 'Passage body A'
      }
    },
    {
      index: 1,
      number: 2,
      question: {
        bankId: 'reading-unit',
        type: 'reading',
        question: 'Read the passage and choose the best answer.',
        readingPassage: 'Passage body B'
      }
    }
  ];

  const groups = buildReadingOverviewPassageGroups(items);

  assert.equal(groups.length, 2);
  assert.deepEqual(groups.map((group) => group.items[0].number), [1, 2]);
});

test('reading overview expands display groups into sub question buttons', () => {
  const items = [
    {
      index: 0,
      number: 1,
      indices: [0, 1, 2],
      question: {
        bankId: 'reading-unit',
        passageId: 'passage-one',
        type: 'reading',
        question: 'Passage One. Read the passage and choose the best answer.'
      },
      subItems: [
        { index: 0, number: 1, question: { type: 'reading' } },
        { index: 1, number: 2, question: { type: 'reading' } },
        { index: 2, number: 3, question: { type: 'reading' } }
      ]
    }
  ];

  const groups = buildReadingOverviewPassageGroups(items);

  assert.equal(groups.length, 1);
  assert.equal(groups[0].title, 'Passage One. Read the passage and choose the best answer.');
  assert.deepEqual(groups[0].items.map((item) => item.number), [1, 2, 3]);
});
