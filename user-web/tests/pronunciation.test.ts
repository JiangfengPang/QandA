import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canUseSpeechSynthesis,
  listBrowserSpeechVoiceOptions,
  isLikelyEnglishSpeechText,
  setPreferredSpeechVoiceKey,
  speakWithBrowser,
  speechItemsForQuestion
} from '../src/utils/pronunciation';

test('pronunciation auto detection accepts English words and phrases only', () => {
  assert.equal(isLikelyEnglishSpeechText('aspiration'), true);
  assert.equal(isLikelyEnglishSpeechText('look upon ... as'), true);
  assert.equal(isLikelyEnglishSpeechText('抱负；志向'), false);
  assert.equal(isLikelyEnglishSpeechText('H2O'), false);
  assert.equal(isLikelyEnglishSpeechText('x = 2'), false);
});

test('speech items use explicit pronunciation before answer inference', () => {
  const items = speechItemsForQuestion({
    type: 'fill',
    answer: ['充分地'],
    pronunciation: { text: 'adequately', lang: 'en-GB', phonetic: '/ˈædɪkwətli/' }
  });

  assert.deepEqual(items, [{
    key: 'question',
    label: '正确答案',
    text: 'adequately',
    lang: 'en-GB',
    phonetic: '/ˈædɪkwətli/',
    explicit: true
  }]);
});

test('speech items stay hidden for non-English fill answers without explicit config', () => {
  assert.deepEqual(speechItemsForQuestion({ type: 'fill', answer: ['辛亥革命'] }), []);
  assert.deepEqual(speechItemsForQuestion({ type: 'fill', answer: ['H2O'] }), []);
});

test('multi blank fill questions create one speech item per speakable blank', () => {
  const items = speechItemsForQuestion({
    type: 'fill',
    fillBlanks: [
      { label: '1', answer: ['aspiration'] },
      { label: '2', answer: ['aspirational', 'ambitious'] },
      { label: '3', answer: ['辛亥革命'] }
    ]
  });

  assert.deepEqual(items.map((item) => ({ label: item.label, text: item.text, explicit: item.explicit })), [
    { label: '第 1 空', text: 'aspiration', explicit: false },
    { label: '第 2 空', text: 'aspirational', explicit: false }
  ]);
});

test('browser speech helper calls native speech synthesis when available', () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const calls: Array<{ type: string; text?: string; lang?: string; rate?: number }> = [];

  class MockSpeechSynthesisUtterance {
    text: string;
    lang = '';
    rate = 1;

    constructor(text: string) {
      this.text = text;
    }
  }

  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      SpeechSynthesisUtterance: MockSpeechSynthesisUtterance,
      speechSynthesis: {
        cancel() {
          calls.push({ type: 'cancel' });
        },
        speak(utterance: MockSpeechSynthesisUtterance) {
          calls.push({
            type: 'speak',
            text: utterance.text,
            lang: utterance.lang,
            rate: utterance.rate
          });
        }
      }
    }
  });

  try {
    assert.equal(canUseSpeechSynthesis(), true);
    assert.equal(speakWithBrowser(' aspiration ', 'en-GB'), true);
    assert.deepEqual(calls, [
      { type: 'cancel' },
      { type: 'speak', text: 'aspiration', lang: 'en-GB', rate: 0.92 }
    ]);
  } finally {
    if (originalWindow) {
      Object.defineProperty(globalThis, 'window', originalWindow);
    } else {
      Reflect.deleteProperty(globalThis, 'window');
    }
  }
});

test('browser speech helper stays inert without native speech synthesis', () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {}
  });

  try {
    assert.equal(canUseSpeechSynthesis(), false);
    assert.equal(speakWithBrowser('aspiration'), false);
  } finally {
    if (originalWindow) {
      Object.defineProperty(globalThis, 'window', originalWindow);
    } else {
      Reflect.deleteProperty(globalThis, 'window');
    }
  }
});

test('browser speech helper uses the selected speech voice when available', () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const originalLocalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const storage = new Map<string, string>();
  const voices = [
    { name: 'Scratchy Voice', lang: 'en-US', localService: true, default: true },
    { name: 'Samantha', lang: 'en-US', localService: true, default: false }
  ] as SpeechSynthesisVoice[];
  let spokenVoice = '';

  class MockSpeechSynthesisUtterance {
    text: string;
    lang = '';
    rate = 1;
    voice: SpeechSynthesisVoice | null = null;

    constructor(text: string) {
      this.text = text;
    }
  }

  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem(key: string) {
        return storage.get(key) || null;
      },
      setItem(key: string, value: string) {
        storage.set(key, value);
      },
      removeItem(key: string) {
        storage.delete(key);
      }
    }
  });
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      SpeechSynthesisUtterance: MockSpeechSynthesisUtterance,
      speechSynthesis: {
        getVoices() {
          return voices;
        },
        cancel() {},
        speak(utterance: MockSpeechSynthesisUtterance) {
          spokenVoice = utterance.voice?.name || '';
        }
      }
    }
  });

  try {
    const options = listBrowserSpeechVoiceOptions('en-US');
    assert.equal(options[0].name, 'Samantha');
    setPreferredSpeechVoiceKey('Scratchy Voice@@en-US');
    assert.equal(speakWithBrowser('aspiration', 'en-US'), true);
    assert.equal(spokenVoice, 'Scratchy Voice');
  } finally {
    if (originalWindow) {
      Object.defineProperty(globalThis, 'window', originalWindow);
    } else {
      Reflect.deleteProperty(globalThis, 'window');
    }
    if (originalLocalStorage) {
      Object.defineProperty(globalThis, 'localStorage', originalLocalStorage);
    } else {
      Reflect.deleteProperty(globalThis, 'localStorage');
    }
  }
});
