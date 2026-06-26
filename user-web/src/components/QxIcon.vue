<template>
  <span class="qx-icon" :data-tone="tone" aria-hidden="true">
    <svg viewBox="0 0 24 24" focusable="false">
      <defs>
        <linearGradient :id="mainGradientId" x1="4" y1="3" x2="20" y2="21" gradientUnits="userSpaceOnUse">
          <stop offset="0" stop-color="var(--qx-icon-a)" />
          <stop offset=".56" stop-color="var(--qx-icon-b)" />
          <stop offset="1" stop-color="var(--qx-icon-c)" />
        </linearGradient>
        <linearGradient :id="softGradientId" x1="3" y1="3" x2="21" y2="21" gradientUnits="userSpaceOnUse">
          <stop offset="0" stop-color="var(--qx-icon-a)" stop-opacity=".24" />
          <stop offset="1" stop-color="var(--qx-icon-b)" stop-opacity=".08" />
        </linearGradient>
      </defs>
      <path
        v-for="(layer, index) in layers"
        :key="`${name}-${index}`"
        :d="layer.d"
        :fill="paint(layer.fill)"
        :stroke="paint(layer.stroke)"
        :stroke-width="layer.strokeWidth ?? 1.8"
        :stroke-linecap="layer.linecap ?? 'round'"
        :stroke-linejoin="layer.linejoin ?? 'round'"
        :fill-rule="layer.fillRule"
        :clip-rule="layer.clipRule"
        :opacity="layer.opacity"
      />
    </svg>
  </span>
</template>

<script setup lang="ts">
import { computed, useId } from 'vue';

type IconPaint = 'none' | 'main' | 'soft' | 'ink' | 'white';

type IconLayer = {
  d: string;
  fill?: IconPaint;
  stroke?: IconPaint;
  strokeWidth?: number;
  linecap?: 'round' | 'butt' | 'square';
  linejoin?: 'round' | 'bevel' | 'miter';
  fillRule?: 'nonzero' | 'evenodd';
  clipRule?: 'nonzero' | 'evenodd';
  opacity?: number;
};

const props = withDefaults(defineProps<{
  name: string;
  tone?: 'blue' | 'green' | 'red' | 'orange' | 'purple' | 'gold' | 'slate' | 'soft' | 'light';
}>(), {
  tone: 'blue'
});

const seed = useId().replace(/[^a-zA-Z0-9_-]/g, '');
const mainGradientId = `qx-icon-main-${seed}`;
const softGradientId = `qx-icon-soft-${seed}`;

const icons: Record<string, IconLayer[]> = {
  home: [
    { d: 'M4.2 11.1 12 4.8l7.8 6.3', fill: 'none', stroke: 'main', strokeWidth: 2 },
    { d: 'M6.2 10.4v8.1c0 .9.7 1.6 1.6 1.6h8.4c.9 0 1.6-.7 1.6-1.6v-8.1', fill: 'soft', stroke: 'main', strokeWidth: 1.65 },
    { d: 'M10.1 20v-5h3.8v5', fill: 'none', stroke: 'ink', strokeWidth: 1.5 }
  ],
  library: [
    { d: 'M5.4 4.9h8.2c1.2 0 2.2 1 2.2 2.2v12H7.3a1.9 1.9 0 0 1-1.9-1.9V4.9Z', fill: 'soft', stroke: 'main', strokeWidth: 1.65 },
    { d: 'M15.8 7.2h1.1c1 0 1.8.8 1.8 1.8v10.1h-2.9', fill: 'none', stroke: 'ink', strokeWidth: 1.5 },
    { d: 'M8.2 8.5h4.9M8.2 11.9h4.9M8.2 15.3h3.4', fill: 'none', stroke: 'main', strokeWidth: 1.45 }
  ],
  review: [
    { d: 'M7 5.8h8.2a2.2 2.2 0 0 1 2.2 2.2v9.2a2.2 2.2 0 0 1-2.2 2.2H7a2.2 2.2 0 0 1-2.2-2.2V8A2.2 2.2 0 0 1 7 5.8Z', fill: 'soft', stroke: 'main', strokeWidth: 1.65 },
    { d: 'M8.6 4.1h5.8M8.2 10h5.8M8.2 13.2h3.6', fill: 'none', stroke: 'ink', strokeWidth: 1.45 },
    { d: 'm13.7 15 1.4 1.4 3.2-3.8', fill: 'none', stroke: 'main', strokeWidth: 1.9 }
  ],
  stats: [
    { d: 'M4.5 19.2h15', fill: 'none', stroke: 'ink', strokeWidth: 1.55 },
    { d: 'M6.8 16.3v-4.1M12 16.3V8.1M17.2 16.3V5.8', fill: 'none', stroke: 'main', strokeWidth: 2 },
    { d: 'M5.9 8.3 9.4 10.8l4.2-5 4.5 3.2', fill: 'none', stroke: 'main', strokeWidth: 1.5 }
  ],
  user: [
    { d: 'M12 12.2a3.8 3.8 0 1 0 0-7.6 3.8 3.8 0 0 0 0 7.6Z', fill: 'soft', stroke: 'main', strokeWidth: 1.7 },
    { d: 'M5.2 20.2c.8-3.6 3.4-5.7 6.8-5.7s6 2.1 6.8 5.7', fill: 'none', stroke: 'ink', strokeWidth: 1.65 }
  ],
  dashboard: [
    { d: 'M5.2 5.1h5.4v5.4H5.2V5.1Zm8.2 0h5.4v5.4h-5.4V5.1ZM5.2 13.5h5.4v5.4H5.2v-5.4Zm8.2 0h5.4v5.4h-5.4v-5.4Z', fill: 'soft', stroke: 'main', strokeWidth: 1.45 },
    { d: 'M7.2 7.8h1.4M15.4 7.8h1.4M7.2 16.2h1.4M15.4 16.2h1.4', fill: 'none', stroke: 'ink', strokeWidth: 1.25 }
  ],
  database: [
    { d: 'M5 7.2c0-1.5 3.1-2.7 7-2.7s7 1.2 7 2.7-3.1 2.7-7 2.7-7-1.2-7-2.7Z', fill: 'soft', stroke: 'main', strokeWidth: 1.55 },
    { d: 'M5 7.2v4.8c0 1.5 3.1 2.7 7 2.7s7-1.2 7-2.7V7.2M5 12v4.8c0 1.5 3.1 2.7 7 2.7s7-1.2 7-2.7V12', fill: 'none', stroke: 'main', strokeWidth: 1.55 },
    { d: 'M8.3 12.1c1 .3 2.2.5 3.7.5s2.7-.2 3.7-.5', fill: 'none', stroke: 'ink', strokeWidth: 1.25 }
  ],
  'check-circle': [
    { d: 'M12 20.2a8.2 8.2 0 1 0 0-16.4 8.2 8.2 0 0 0 0 16.4Z', fill: 'soft', stroke: 'main', strokeWidth: 1.7 },
    { d: 'm8.2 12 2.5 2.5 5.1-5.8', fill: 'none', stroke: 'main', strokeWidth: 2.1 }
  ],
  'x-circle': [
    { d: 'M12 20.2a8.2 8.2 0 1 0 0-16.4 8.2 8.2 0 0 0 0 16.4Z', fill: 'soft', stroke: 'main', strokeWidth: 1.7 },
    { d: 'm9 9 6 6M15 9l-6 6', fill: 'none', stroke: 'main', strokeWidth: 2 }
  ],
  target: [
    { d: 'M12 20.2a8.2 8.2 0 1 0 0-16.4 8.2 8.2 0 0 0 0 16.4Z', fill: 'soft', stroke: 'main', strokeWidth: 1.55 },
    { d: 'M12 16.2a4.2 4.2 0 1 0 0-8.4 4.2 4.2 0 0 0 0 8.4Z', fill: 'none', stroke: 'ink', strokeWidth: 1.4 },
    { d: 'M12 12h7.2M12 12l3.8-3.8', fill: 'none', stroke: 'main', strokeWidth: 1.8 }
  ],
  clock: [
    { d: 'M12 20.2a8.2 8.2 0 1 0 0-16.4 8.2 8.2 0 0 0 0 16.4Z', fill: 'soft', stroke: 'main', strokeWidth: 1.65 },
    { d: 'M12 7.6v5l3.5 2.1', fill: 'none', stroke: 'ink', strokeWidth: 1.9 },
    { d: 'M8.8 2.9h6.4', fill: 'none', stroke: 'main', strokeWidth: 1.6 }
  ],
  list: [
    { d: 'M6 5.4h12a1.8 1.8 0 0 1 1.8 1.8v9.6a1.8 1.8 0 0 1-1.8 1.8H6a1.8 1.8 0 0 1-1.8-1.8V7.2A1.8 1.8 0 0 1 6 5.4Z', fill: 'soft', stroke: 'main', strokeWidth: 1.55 },
    { d: 'M7.8 9h8.4M7.8 12h8.4M7.8 15h5.2', fill: 'none', stroke: 'ink', strokeWidth: 1.45 }
  ],
  'chevron-right': [
    { d: 'm9.5 5.6 6.1 6.4-6.1 6.4', fill: 'none', stroke: 'main', strokeWidth: 2.2 }
  ],
  'chevron-left': [
    { d: 'M14.5 5.6 8.4 12l6.1 6.4', fill: 'none', stroke: 'main', strokeWidth: 2.2 }
  ],
  close: [
    { d: 'M6.9 6.9 17.1 17.1M17.1 6.9 6.9 17.1', fill: 'none', stroke: 'main', strokeWidth: 2.15 }
  ],
  grid: [
    { d: 'M4.6 4.6h5.2v5.2H4.6V4.6Zm9.6 0h5.2v5.2h-5.2V4.6ZM4.6 14.2h5.2v5.2H4.6v-5.2Zm9.6 0h5.2v5.2h-5.2v-5.2Z', fill: 'soft', stroke: 'main', strokeWidth: 1.5 }
  ],
  star: [
    { d: 'm12 3.6 2.48 5.03 5.55.8-4.02 3.92.95 5.53L12 16.27l-4.96 2.61.95-5.53-4.02-3.92 5.55-.8L12 3.6Z', fill: 'soft', stroke: 'main', strokeWidth: 1.55 }
  ],
  version: [
    { d: 'M6.2 4.8h8.2l3.4 3.4v11H6.2v-14.4Z', fill: 'soft', stroke: 'main', strokeWidth: 1.55 },
    { d: 'M14.2 4.9v3.5h3.5M8.6 13.4l2.1 2.8 4.7-6.4', fill: 'none', stroke: 'ink', strokeWidth: 1.45 }
  ],
  info: [
    { d: 'M12 20.2a8.2 8.2 0 1 0 0-16.4 8.2 8.2 0 0 0 0 16.4Z', fill: 'soft', stroke: 'main', strokeWidth: 1.65 },
    { d: 'M12 10.8v5.4M12 7.4h.01', fill: 'none', stroke: 'ink', strokeWidth: 2.1 }
  ],
  lock: [
    { d: 'M6.2 10.5h11.6v8.4H6.2v-8.4Z', fill: 'soft', stroke: 'main', strokeWidth: 1.6 },
    { d: 'M8.6 10.3V8.4a3.4 3.4 0 0 1 6.8 0v1.9M12 14.1v2.1', fill: 'none', stroke: 'ink', strokeWidth: 1.65 }
  ],
  mail: [
    { d: 'M4.7 6.5h14.6v11H4.7v-11Z', fill: 'soft', stroke: 'main', strokeWidth: 1.6 },
    { d: 'm5.2 7.3 6.8 5.4 6.8-5.4M5.4 17l4.6-4M18.6 17l-4.6-4', fill: 'none', stroke: 'ink', strokeWidth: 1.35 }
  ],
  megaphone: [
    { d: 'M4.9 10.2h3.2l7.6-4.1v11.8l-7.6-4.1H4.9v-3.6Z', fill: 'soft', stroke: 'main', strokeWidth: 1.55 },
    { d: 'M8.2 13.9 9.4 19h2.8l-1.6-4.3', fill: 'none', stroke: 'ink', strokeWidth: 1.55 },
    { d: 'M18.4 9.1c.9.8 1.4 1.8 1.4 2.9s-.5 2.1-1.4 2.9', fill: 'none', stroke: 'main', strokeWidth: 1.65 }
  ],
  speaker: [
    { d: 'M5 10.1h3.2l5.5-4.2v12.2l-5.5-4.2H5v-3.8Z', fill: 'soft', stroke: 'main', strokeWidth: 1.55 },
    { d: 'M16.5 9.2c.7.7 1.1 1.7 1.1 2.8s-.4 2.1-1.1 2.8', fill: 'none', stroke: 'ink', strokeWidth: 1.6 },
    { d: 'M18.7 6.8c1.4 1.3 2.1 3.1 2.1 5.2s-.7 3.9-2.1 5.2', fill: 'none', stroke: 'main', strokeWidth: 1.55 }
  ],
  logout: [
    { d: 'M5.3 5.2h7.4v13.6H5.3V5.2Z', fill: 'soft', stroke: 'main', strokeWidth: 1.55 },
    { d: 'M12.8 12h6.6M16.8 8.6 20.2 12l-3.4 3.4', fill: 'none', stroke: 'main', strokeWidth: 1.9 },
    { d: 'M8.2 12h.01', fill: 'none', stroke: 'ink', strokeWidth: 2.4 }
  ],
  analysis: [
    { d: 'M5.5 5.2h8.4a2 2 0 0 1 2 2v10.9H5.5V5.2Z', fill: 'soft', stroke: 'main', strokeWidth: 1.55 },
    { d: 'M8.2 9.1h5M8.2 12h4M8.2 14.9h2.6', fill: 'none', stroke: 'ink', strokeWidth: 1.35 },
    { d: 'M14 15.2a3.1 3.1 0 1 0 4.4 0 3.1 3.1 0 0 0-4.4 0Zm4.2 4.2 1.8 1.8', fill: 'none', stroke: 'main', strokeWidth: 1.6 }
  ],
  font: [
    { d: 'M5.5 18.7 11 5.3h2l5.5 13.4', fill: 'none', stroke: 'main', strokeWidth: 1.75 },
    { d: 'M8.1 13.5h7.8M7.3 18.7h2.2M14.5 18.7h2.2', fill: 'none', stroke: 'ink', strokeWidth: 1.5 }
  ],
  overview: [
    { d: 'M5 5.2h5v5H5v-5Zm0 8.6h5v5H5v-5Zm8.5-8.6H19v5h-5.5v-5Zm0 8.6H19v5h-5.5v-5Z', fill: 'soft', stroke: 'main', strokeWidth: 1.45 },
    { d: 'M6.8 7.7h1.4M15.4 7.7h1.7M6.8 16.3h1.4M15.4 16.3h1.7', fill: 'none', stroke: 'ink', strokeWidth: 1.2 }
  ],
  practice: [
    { d: 'M5.5 5.7h8.8a2 2 0 0 1 2 2v10.6H5.5V5.7Z', fill: 'soft', stroke: 'main', strokeWidth: 1.55 },
    { d: 'M8.2 9.5h5.5M8.2 12.4h4.2', fill: 'none', stroke: 'ink', strokeWidth: 1.35 },
    { d: 'm13.2 16.4 4.7-4.7 1.9 1.9-4.7 4.7-2.5.6.6-2.5Z', fill: 'soft', stroke: 'main', strokeWidth: 1.35 }
  ],
  percent: [
    { d: 'M7.8 9.5a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4ZM16.2 18.9a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4Z', fill: 'soft', stroke: 'main', strokeWidth: 1.55 },
    { d: 'M17.6 5.7 6.4 18.3', fill: 'none', stroke: 'ink', strokeWidth: 1.7 }
  ],
  warning: [
    { d: 'M11.1 4.7 3.9 17.2c-.4.7.1 1.6.9 1.6h14.4c.8 0 1.3-.9.9-1.6L12.9 4.7c-.4-.7-1.4-.7-1.8 0Z', fill: 'soft', stroke: 'main', strokeWidth: 1.6 },
    { d: 'M12 9v4.4M12 16.4h.01', fill: 'none', stroke: 'ink', strokeWidth: 2 }
  ],
  sparkle: [
    { d: 'M12 3.8 13.9 9l5.2 1.9-5.2 1.9L12 18l-1.9-5.2-5.2-1.9L10.1 9 12 3.8Z', fill: 'soft', stroke: 'main', strokeWidth: 1.55 },
    { d: 'm18.2 4.9.6 1.7 1.7.6-1.7.6-.6 1.7-.6-1.7-1.7-.6 1.7-.6.6-1.7Z', fill: 'soft', stroke: 'ink', strokeWidth: 1.1 }
  ],
  clear: [
    { d: 'M12 20.2a8.2 8.2 0 1 0 0-16.4 8.2 8.2 0 0 0 0 16.4Z', fill: 'soft', stroke: 'main', strokeWidth: 1.55 },
    { d: 'm9.2 9.2 5.6 5.6M14.8 9.2l-5.6 5.6', fill: 'none', stroke: 'ink', strokeWidth: 1.7 }
  ],
  eye: [
    { d: 'M3.8 12s2.9-5.2 8.2-5.2 8.2 5.2 8.2 5.2-2.9 5.2-8.2 5.2S3.8 12 3.8 12Z', fill: 'soft', stroke: 'main', strokeWidth: 1.55 },
    { d: 'M12 14.7a2.7 2.7 0 1 0 0-5.4 2.7 2.7 0 0 0 0 5.4Z', fill: 'none', stroke: 'ink', strokeWidth: 1.45 }
  ],
  'eye-off': [
    { d: 'M4.5 5.2 19.5 19.2', fill: 'none', stroke: 'ink', strokeWidth: 1.7 },
    { d: 'M9.2 6.9A8.4 8.4 0 0 1 12 6.4c5.3 0 8.2 5.6 8.2 5.6a13 13 0 0 1-2.2 2.8M14.4 16.7c-.8.3-1.6.5-2.4.5-5.3 0-8.2-5.2-8.2-5.2a12.7 12.7 0 0 1 3.5-3.8', fill: 'soft', stroke: 'main', strokeWidth: 1.55 },
    { d: 'M9.8 10.1a2.7 2.7 0 0 0 3.8 3.8', fill: 'none', stroke: 'ink', strokeWidth: 1.45 }
  ]
};

const name = computed(() => props.name);
const layers = computed(() => icons[props.name] || icons.sparkle);

function paint(value: IconPaint = 'none') {
  if (value === 'main') return `url(#${mainGradientId})`;
  if (value === 'soft') return `url(#${softGradientId})`;
  if (value === 'ink') return 'var(--qx-icon-ink)';
  if (value === 'white') return '#fff';
  return 'none';
}
</script>
