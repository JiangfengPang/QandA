export type PronunciationConfig = {
  text: string;
  lang: string;
  phonetic?: string;
  explicit: boolean;
};

export type SpeechItem = {
  key: string;
  text: string;
  lang: string;
  label: string;
  phonetic?: string;
  explicit: boolean;
};

export type SpeechVoiceOption = {
  key: string;
  label: string;
  name: string;
  lang: string;
  localService: boolean;
  default: boolean;
};

type FillSpeechBlank = {
  id: string;
  label: string;
  answer: string[];
  pronunciation?: unknown;
};

type SpeechWindow = Window & typeof globalThis & {
  SpeechSynthesisUtterance?: typeof SpeechSynthesisUtterance;
};

const SPEECH_VOICE_STORAGE_KEY = 'qanda:speechVoiceKey';
const SPEECH_VOICE_CHANGE_EVENT = 'qanda:speechVoiceChanged';
const PREFERRED_VOICE_RE = /(samantha|ava|allison|susan|victoria|alex|karen|moira|tessa|google us english|aria|jenny|natural|premium)/i;
const NOVELTY_VOICE_RE = /(albert|bad news|bahh|bells|boing|bubbles|cellos|deranged|fred|good news|grandma|grandpa|hysterical|jester|junior|organ|princess|ralph|rocko|sandy|shelley|superstar|trinoids|whisper|wobble|zarvox)/i;

function speechWindow() {
  return typeof window === 'undefined' ? null : window as SpeechWindow;
}

function cleanSpeechText(value: unknown) {
  return String(value ?? '')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/…/g, '...')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizePronunciationConfig(value: unknown, fallbackText = ''): PronunciationConfig | null {
  if (typeof value === 'string') {
    const text = cleanSpeechText(value);
    return text ? { text, lang: 'en-US', explicit: true } : null;
  }

  if (value && typeof value === 'object') {
    const raw = value as Record<string, unknown>;
    const text = cleanSpeechText(raw.text ?? raw.word ?? raw.value ?? raw.speakText ?? fallbackText);
    if (!text) return null;
    return {
      text,
      lang: cleanSpeechText(raw.lang ?? raw.language ?? 'en-US') || 'en-US',
      phonetic: raw.phonetic ? cleanSpeechText(raw.phonetic) : undefined,
      explicit: true
    };
  }

  const text = cleanSpeechText(fallbackText);
  return text ? { text, lang: 'en-US', explicit: false } : null;
}

export function isLikelyEnglishSpeechText(value: unknown) {
  const text = cleanSpeechText(value);
  if (!text || text.length > 80) return false;
  if (/[\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]/.test(text)) return false;
  if (/[0-9=<>√∑∫≤≥÷×]/.test(text)) return false;
  const letters = text.match(/[A-Za-z]/g) || [];
  if (letters.length < 2) return false;
  const words = text.match(/[A-Za-z]+(?:[-'][A-Za-z]+)*/g) || [];
  if (!words.length || words.length > 8) return false;
  return /^[A-Za-z][A-Za-z\s.'’,-]*[A-Za-z.]$/.test(text);
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.map((item) => cleanSpeechText(item)).filter(Boolean) : [];
}

function primaryAnswerText(value: unknown) {
  const text = cleanSpeechText(value);
  return text.split(/\s*(?:\/|｜|\||、|；|;)\s*/)[0] || text;
}

function fillBlankDefinitions(question: any): FillSpeechBlank[] {
  if (question?.type !== 'fill') return [];
  const blanks = Array.isArray(question.fillBlanks) ? question.fillBlanks : [];
  if (blanks.length) {
    return blanks.map((blank: any, index: number) => ({
      id: cleanSpeechText(blank?.id) || `blank-${index + 1}`,
      label: cleanSpeechText(blank?.label) || String(index + 1),
      answer: stringArray(blank?.answer),
      pronunciation: blank?.pronunciation
    })).filter((blank: FillSpeechBlank) => blank.answer.length > 0 || blank.pronunciation);
  }

  const answer = stringArray(question?.answer);
  return answer.length ? [{ id: 'blank-1', label: '1', answer, pronunciation: question?.pronunciation }] : [];
}

function speechItemFromConfig(key: string, label: string, config: PronunciationConfig | null): SpeechItem | null {
  if (!config) return null;
  if (!config.explicit && !isLikelyEnglishSpeechText(config.text)) return null;
  return {
    key,
    label,
    text: config.text,
    lang: config.lang || 'en-US',
    phonetic: config.phonetic,
    explicit: config.explicit
  };
}

export function speechItemsForQuestion(question: any): SpeechItem[] {
  if (!question || question.type !== 'fill') return [];

  const questionPronunciation = normalizePronunciationConfig(question.pronunciation);
  if (questionPronunciation?.explicit) {
    const item = speechItemFromConfig('question', '正确答案', questionPronunciation);
    return item ? [item] : [];
  }

  const blanks = fillBlankDefinitions(question);
  if (blanks.length > 1) {
    return blanks
      .map((blank: FillSpeechBlank, index: number) => speechItemFromConfig(
        blank.id || `blank-${index + 1}`,
        `第 ${blank.label || index + 1} 空`,
        normalizePronunciationConfig(blank.pronunciation, blank.answer[0])
      ))
      .filter((item: SpeechItem | null): item is SpeechItem => Boolean(item));
  }

  const firstBlank = blanks[0];
  const fallback = firstBlank?.answer?.[0] || primaryAnswerText(question.answer?.[0]);
  const item = speechItemFromConfig('answer', '正确答案', normalizePronunciationConfig(firstBlank?.pronunciation ?? question.pronunciation, fallback));
  return item ? [item] : [];
}

export function canUseSpeechSynthesis() {
  const win = speechWindow();
  return Boolean(
    win?.speechSynthesis
    && typeof win.speechSynthesis.speak === 'function'
    && typeof win.SpeechSynthesisUtterance === 'function'
  );
}

function browserSpeechVoices() {
  const win = speechWindow();
  if (!win?.speechSynthesis || typeof win.speechSynthesis.getVoices !== 'function') return [];
  try {
    return win.speechSynthesis.getVoices();
  } catch {
    return [];
  }
}

function speechVoiceKey(voice: SpeechSynthesisVoice) {
  return `${voice.name}@@${voice.lang}`;
}

function languageBase(lang: string) {
  return cleanSpeechText(lang).split('-')[0].toLowerCase();
}

function voiceScore(voice: SpeechSynthesisVoice, lang = 'en-US') {
  const desiredLang = cleanSpeechText(lang || 'en-US').toLowerCase();
  const desiredBase = languageBase(desiredLang);
  const voiceLang = cleanSpeechText(voice.lang).toLowerCase();
  const voiceBase = languageBase(voiceLang);
  let score = 0;

  if (voiceLang === desiredLang) score += 80;
  else if (voiceBase && voiceBase === desiredBase) score += 55;
  else if (desiredBase === 'en' && voiceBase === 'en') score += 45;

  if (voice.localService) score += 8;
  if (voice.default) score += 4;
  if (PREFERRED_VOICE_RE.test(voice.name)) score += 24;
  if (NOVELTY_VOICE_RE.test(voice.name)) score -= 100;
  return score;
}

function sortVoicesForLang(voices: SpeechSynthesisVoice[], lang = 'en-US') {
  return [...voices].sort((a, b) => {
    const scoreDiff = voiceScore(b, lang) - voiceScore(a, lang);
    if (scoreDiff) return scoreDiff;
    return `${a.lang} ${a.name}`.localeCompare(`${b.lang} ${b.name}`);
  });
}

export function listBrowserSpeechVoiceOptions(lang = 'en-US'): SpeechVoiceOption[] {
  const voices = browserSpeechVoices();
  if (!voices.length) return [];

  const desiredBase = languageBase(lang || 'en-US');
  const matchedVoices = voices.filter((voice) => {
    const voiceBase = languageBase(voice.lang);
    return voiceBase === desiredBase || (desiredBase === 'en' && voiceBase === 'en');
  });
  const visibleVoices = matchedVoices.length ? matchedVoices : voices;

  return sortVoicesForLang(visibleVoices, lang).map((voice) => ({
    key: speechVoiceKey(voice),
    label: `${voice.name} (${voice.lang})${voice.localService ? ' 本地' : ''}`,
    name: voice.name,
    lang: voice.lang,
    localService: voice.localService,
    default: voice.default
  }));
}

export function compactBrowserSpeechVoiceOptions(lang = 'en-US', selectedKey = '', limit = 6): SpeechVoiceOption[] {
  const options = listBrowserSpeechVoiceOptions(lang);
  const naturalOptions = options.filter((voice) => !NOVELTY_VOICE_RE.test(voice.name));
  const visibleOptions = (naturalOptions.length ? naturalOptions : options).slice(0, limit);
  const selectedOption = selectedKey ? options.find((voice) => voice.key === selectedKey) : null;
  if (selectedOption && !visibleOptions.some((voice) => voice.key === selectedOption.key)) {
    return [selectedOption, ...visibleOptions.slice(0, Math.max(limit - 1, 0))];
  }
  return visibleOptions;
}

export function getPreferredSpeechVoiceKey() {
  try {
    return typeof localStorage === 'undefined' ? '' : localStorage.getItem(SPEECH_VOICE_STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

export function setPreferredSpeechVoiceKey(key: string) {
  try {
    if (typeof localStorage !== 'undefined') {
      const value = cleanSpeechText(key);
      if (value) localStorage.setItem(SPEECH_VOICE_STORAGE_KEY, value);
      else localStorage.removeItem(SPEECH_VOICE_STORAGE_KEY);
    }
    const win = speechWindow();
    if (typeof win?.dispatchEvent === 'function') win.dispatchEvent(new Event(SPEECH_VOICE_CHANGE_EVENT));
  } catch {
    // Voice preference is a convenience setting; speech still works if storage is unavailable.
  }
}

export function onPreferredSpeechVoiceChange(callback: () => void) {
  const win = speechWindow();
  if (!win) return () => {};
  win.addEventListener(SPEECH_VOICE_CHANGE_EVENT, callback);
  return () => win.removeEventListener(SPEECH_VOICE_CHANGE_EVENT, callback);
}

export function resolveBrowserSpeechVoice(lang = 'en-US') {
  const voices = browserSpeechVoices();
  if (!voices.length) return null;
  const preferredKey = getPreferredSpeechVoiceKey();
  const preferredVoice = preferredKey ? voices.find((voice) => speechVoiceKey(voice) === preferredKey) : null;
  return preferredVoice || sortVoicesForLang(voices, lang)[0] || null;
}

export function currentBrowserSpeechVoiceKey(lang = 'en-US') {
  const preferredKey = getPreferredSpeechVoiceKey();
  if (preferredKey) return preferredKey;
  const voice = resolveBrowserSpeechVoice(lang);
  return voice ? speechVoiceKey(voice) : '';
}

export function speakWithBrowser(text: string, lang = 'en-US') {
  const win = speechWindow();
  if (!canUseSpeechSynthesis() || !win?.speechSynthesis || !win.SpeechSynthesisUtterance) return false;
  const utterance = new win.SpeechSynthesisUtterance(cleanSpeechText(text));
  utterance.lang = lang || 'en-US';
  const voice = resolveBrowserSpeechVoice(lang);
  if (voice) {
    utterance.voice = voice;
    utterance.lang = voice.lang || utterance.lang;
  }
  utterance.rate = 0.92;
  win.speechSynthesis.cancel();
  win.speechSynthesis.speak(utterance);
  return true;
}
