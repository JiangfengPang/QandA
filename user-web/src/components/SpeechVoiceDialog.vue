<template>
  <van-dialog
    v-model:show="visible"
    class-name="qx-speech-voice-dialog"
    title="发音音色"
    show-cancel-button
    confirm-button-text="保存"
    cancel-button-text="取消"
    close-on-click-overlay
    :before-close="beforeClose"
  >
    <div class="qvoice-settings">
      <p class="qvoice-summary">当前：<strong>{{ currentLabel }}</strong></p>

      <div class="qvoice-option-list">
        <button
          type="button"
          class="qvoice-option"
          :class="{ active: !draftKey }"
          @click="draftKey = ''"
        >
          <strong>自动推荐</strong>
          <span>{{ recommendedText }}</span>
        </button>
        <button
          v-for="voice in compactVoices"
          :key="voice.key"
          type="button"
          class="qvoice-option"
          :class="{ active: draftKey === voice.key }"
          @click="draftKey = voice.key"
        >
          <strong>{{ voice.name }}</strong>
          <span>{{ voice.lang }}{{ voice.localService ? ' · 本地音色' : '' }}</span>
        </button>
      </div>

      <button class="qvoice-preview-btn" type="button" :disabled="!supported" @click="preview">
        试听当前音色
      </button>
    </div>
  </van-dialog>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { showToast } from 'vant';
import { useAuthStore } from '../stores/auth';
import {
  canUseSpeechSynthesis,
  compactBrowserSpeechVoiceOptions,
  listBrowserSpeechVoiceOptions,
  setPreferredSpeechVoiceKey,
  speakWithBrowser,
  type SpeechVoiceOption
} from '../utils/pronunciation';

const props = defineProps<{
  show: boolean;
}>();

const emit = defineEmits<{
  (event: 'update:show', value: boolean): void;
}>();

const auth = useAuthStore();
const voices = ref<SpeechVoiceOption[]>([]);
const draftKey = ref('');

const visible = computed({
  get: () => props.show,
  set: (value: boolean) => emit('update:show', value)
});
const supported = computed(() => canUseSpeechSynthesis());
const savedKey = computed(() => auth.user?.preferences?.speechVoiceKey || '');
const selectedVoice = computed(() => voices.value.find((voice) => voice.key === draftKey.value));
const savedVoice = computed(() => voices.value.find((voice) => voice.key === savedKey.value));
const recommendedVoice = computed(() => compactBrowserSpeechVoiceOptions('en-US', '', 1)[0]);
const compactVoices = computed(() => compactBrowserSpeechVoiceOptions('en-US', draftKey.value || savedKey.value, 3));
const recommendedText = computed(() => (
  recommendedVoice.value
    ? `${recommendedVoice.value.name}（${recommendedVoice.value.lang}）`
    : '由浏览器选择可用音色'
));
const currentLabel = computed(() => {
  if (!supported.value) return '浏览器不支持';
  if (savedVoice.value) return savedVoice.value.name;
  if (savedKey.value) return '当前设备不可用';
  return '自动推荐';
});

onMounted(() => {
  refreshVoices();
  if (typeof window !== 'undefined' && window.speechSynthesis) {
    window.speechSynthesis.addEventListener('voiceschanged', refreshVoices);
  }
});

onBeforeUnmount(() => {
  if (typeof window !== 'undefined' && window.speechSynthesis) {
    window.speechSynthesis.removeEventListener('voiceschanged', refreshVoices);
  }
});

watch(() => props.show, (show) => {
  if (!show) return;
  refreshVoices();
  draftKey.value = savedKey.value;
});

function refreshVoices() {
  voices.value = listBrowserSpeechVoiceOptions('en-US');
}

function restoreSavedVoice() {
  setPreferredSpeechVoiceKey(savedKey.value);
}

function preview() {
  if (!supported.value) return;
  setPreferredSpeechVoiceKey(draftKey.value);
  speakWithBrowser('aspiration', selectedVoice.value?.lang || 'en-US');
}

async function beforeClose(action: string) {
  if (action !== 'confirm') {
    restoreSavedVoice();
    return true;
  }
  const previous = savedKey.value;
  setPreferredSpeechVoiceKey(draftKey.value);
  try {
    await auth.updatePreferences({ speechVoiceKey: draftKey.value });
    showToast('发音音色已保存');
    if (supported.value) speakWithBrowser('aspiration', selectedVoice.value?.lang || 'en-US');
    return true;
  } catch (error) {
    setPreferredSpeechVoiceKey(previous);
    showToast({ type: 'fail', message: error instanceof Error ? error.message : '音色保存失败' });
    return false;
  }
}
</script>

<style scoped>
.qvoice-settings {
  padding: 12px 14px 14px;
  display: grid;
  gap: 10px;
}

.qvoice-summary {
  margin: 0;
  color: #64748b;
  font-size: 12px;
  font-weight: 850;
  line-height: 1.4;
}

.qvoice-summary strong {
  color: #0f172a;
  font-weight: 950;
}

.qvoice-option-list {
  display: grid;
  gap: 7px;
}

.qvoice-option {
  min-height: 46px;
  display: grid;
  align-content: center;
  gap: 4px;
  width: 100%;
  padding: 8px 11px;
  border: 1px solid #e4ebf3;
  border-radius: 14px;
  background: #f8fbff;
  color: #0f172a;
  text-align: left;
}

.qvoice-option.active {
  border-color: rgba(24, 129, 255, .44);
  background: #eef6ff;
  box-shadow: inset 0 0 0 1px rgba(24, 129, 255, .12);
}

.qvoice-option strong,
.qvoice-option span {
  min-width: 0;
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.qvoice-option strong {
  font-size: 14px;
  font-weight: 950;
}

.qvoice-option span {
  color: #64748b;
  font-size: 12px;
  font-weight: 800;
}

.qvoice-preview-btn {
  width: 100%;
  min-height: 38px;
  border: 1px solid rgba(16, 185, 129, .28);
  border-radius: 12px;
  background: rgba(16, 185, 129, .08);
  color: #047857;
  font-size: 14px;
  font-weight: 950;
}

.qvoice-preview-btn:disabled {
  opacity: .55;
  cursor: not-allowed;
}
</style>
