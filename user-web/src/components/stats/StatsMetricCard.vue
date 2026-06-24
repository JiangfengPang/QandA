<template>
  <article class="qstat-metric-card" :class="toneClass">
    <span class="qstat-metric-label">{{ label }}</span>
    <strong class="qstat-metric-value" :class="{ compact }">
      <span
        v-for="(part, index) in valueParts"
        :key="`${part.kind}-${index}-${part.text}`"
        :class="part.kind === 'unit' ? 'qstat-metric-unit' : 'qstat-metric-number'"
      >
        {{ part.text }}
      </span>
    </strong>
    <p class="qstat-metric-sub">{{ sub }}</p>
    <i class="qstat-metric-icon">
      <QxIcon :name="icon" :tone="iconTone" />
    </i>
  </article>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import QxIcon from '../QxIcon.vue';

const props = defineProps<{
  label: string;
  value: string | number;
  unit?: string;
  sub: string;
  icon: string;
  tone?: 'green' | 'purple' | 'orange' | 'soft';
  compact?: boolean;
}>();

const toneClass = computed(() => props.tone ? `qstat-metric-${props.tone}` : '');
const valueParts = computed(() => {
  const mainValue = String(props.value ?? '');
  if (props.unit) {
    return [
      { text: mainValue, kind: 'number' },
      { text: props.unit, kind: 'unit' }
    ];
  }

  const parts = mainValue.match(/\d+|\D+/g) || [mainValue];
  return parts.map((text) => ({
    text,
    kind: /^\d+$/.test(text) ? 'number' : 'unit'
  }));
});
const iconTone = computed(() => {
  if (props.tone === 'green') return 'green';
  if (props.tone === 'purple') return 'purple';
  if (props.tone === 'orange') return 'orange';
  if (props.tone === 'soft') return 'red';
  return 'blue';
});
</script>
