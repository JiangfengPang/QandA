import assert from 'node:assert/strict';
import test from 'node:test';
import { createRemotePracticeResumeSaveController } from '../src/utils/practiceResumeRemote';
import type { PracticeResumeSnapshot } from '../src/utils/practiceResume';

function snapshot(overrides: Partial<PracticeResumeSnapshot> = {}): PracticeResumeSnapshot {
  return {
    version: 1,
    currentIndex: 0,
    questionId: 'q1',
    questionIds: ['q1', 'q2'],
    sessionRecords: {},
    updatedAt: '2026-06-29T00:00:00.000Z',
    ...overrides
  };
}

function createScheduler() {
  const timers = new Map<number, () => void>();
  let nextId = 1;
  return {
    timers,
    setTimeoutFn(callback: () => void) {
      const id = nextId++;
      timers.set(id, callback);
      return id as unknown as ReturnType<typeof setTimeout>;
    },
    clearTimeoutFn(id: ReturnType<typeof setTimeout>) {
      timers.delete(id as unknown as number);
    },
    runNext() {
      const [id, callback] = timers.entries().next().value || [];
      if (!id || !callback) return false;
      timers.delete(id);
      callback();
      return true;
    }
  };
}

test('remote practice resume save controller debounces frequent session changes', async () => {
  const scheduler = createScheduler();
  let currentSnapshot = snapshot();
  const saved: string[] = [];
  const controller = createRemotePracticeResumeSaveController({
    read: () => ({ key: 'session-a', snapshot: currentSnapshot }),
    save: async (key, value) => {
      saved.push(`${key}:${value.questionId}`);
      return value;
    },
    setTimeoutFn: scheduler.setTimeoutFn,
    clearTimeoutFn: scheduler.clearTimeoutFn,
    debounceMs: 1000
  });

  controller.schedule();
  currentSnapshot = snapshot({ currentIndex: 1, questionId: 'q2' });
  controller.schedule();
  controller.schedule();

  assert.equal(scheduler.timers.size, 1);
  assert.equal(saved.length, 0);
  scheduler.runNext();
  await Promise.resolve();

  assert.deepEqual(saved, ['session-a:q2']);
});

test('remote practice resume save controller keeps one request in flight and saves dirty latest state', async () => {
  let resolveFirstSave: ((value: PracticeResumeSnapshot) => void) | undefined;
  let currentSnapshot = snapshot();
  const savedQuestions: string[] = [];
  const controller = createRemotePracticeResumeSaveController({
    read: () => ({ key: 'session-a', snapshot: currentSnapshot }),
    save: (key, value) => {
      savedQuestions.push(`${key}:${value.questionId}`);
      if (!resolveFirstSave) {
        return new Promise<PracticeResumeSnapshot>((resolve) => {
          resolveFirstSave = resolve;
        });
      }
      return Promise.resolve(value);
    },
    debounceMs: 1
  });

  const firstFlush = controller.flush();
  currentSnapshot = snapshot({ currentIndex: 1, questionId: 'q2' });
  await controller.flush();

  assert.deepEqual(savedQuestions, ['session-a:q1']);
  resolveFirstSave?.(snapshot());
  await firstFlush;
  await new Promise((resolve) => setTimeout(resolve, 5));

  assert.deepEqual(savedQuestions, ['session-a:q1', 'session-a:q2']);
});

test('remote practice resume save controller skips identical session content even when updatedAt changes', async () => {
  let currentSnapshot = snapshot();
  let saveCount = 0;
  const controller = createRemotePracticeResumeSaveController({
    read: () => ({ key: 'session-a', snapshot: currentSnapshot }),
    save: async (_key, value) => {
      saveCount += 1;
      return value;
    }
  });

  await controller.flush();
  currentSnapshot = snapshot({ updatedAt: '2026-06-29T00:00:05.000Z' });
  await controller.flush();

  assert.equal(saveCount, 1);
});
