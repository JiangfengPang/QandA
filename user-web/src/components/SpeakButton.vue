<template>
  <button
    v-if="eligible"
    class="qx-speak-button"
    type="button"
    :aria-label="accessibleLabel"
    :title="accessibleLabel"
    :disabled="!supported"
    @click.stop.prevent="speak"
  >
    <QxIcon name="speaker" tone="green" />
  </button>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import QxIcon from './QxIcon.vue';
import { canUseSpeechSynthesis, isLikelyEnglishSpeechText, speakWithBrowser } from '../utils/pronunciation';

const props = withDefaults(defineProps<{
  text?: string;
  lang?: string;
  label?: string;
  explicit?: boolean;
}>(), {
  text: '',
  lang: 'en-US',
  label: '发音',
  explicit: false
});

const speechText = computed(() => String(props.text || '').trim());
const eligible = computed(() => (
  Boolean(speechText.value)
  && (props.explicit || isLikelyEnglishSpeechText(speechText.value))
));
const supported = computed(() => canUseSpeechSynthesis());
const buttonLabel = computed(() => `${props.label || '发音'}：${speechText.value}`);
const accessibleLabel = computed(() => (
  supported.value ? buttonLabel.value : `${buttonLabel.value}（当前浏览器不支持发音）`
));

function speak() {
  if (!supported.value) return;
  speakWithBrowser(speechText.value, props.lang || 'en-US');
}
</script>

<style scoped>
.qx-speak-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  margin-left: 6px;
  border: 1px solid rgba(16, 185, 129, .28);
  border-radius: 999px;
  background: rgba(16, 185, 129, .08);
  color: #047857;
  vertical-align: middle;
  cursor: pointer;
}

.qx-speak-button:hover {
  border-color: rgba(16, 185, 129, .46);
  background: rgba(16, 185, 129, .14);
}

.qx-speak-button:active {
  transform: translateY(1px);
}

.qx-speak-button:disabled {
  opacity: .45;
  cursor: not-allowed;
}

.qx-speak-button:disabled:active {
  transform: none;
}

.qx-speak-button :deep(.qx-icon) {
  width: 17px;
  height: 17px;
}
</style>
