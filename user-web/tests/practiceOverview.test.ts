import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPracticeOverviewGroups } from '../src/utils/practiceOverview';

const typeLabel = (question: { type?: string }) => ({
  single: '单选',
  multiple: '多选',
  judge: '判断题'
}[question.type || 'single'] || '其他');

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
