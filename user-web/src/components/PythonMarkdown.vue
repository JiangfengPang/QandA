<template>
  <div
    class="qx-markdown-answer"
    v-html="renderedMarkdown"
    @click="handleCopyClick"
  ></div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { showToast } from 'vant';
import { decodeMarkdownCode, renderMarkdown } from '../utils/markdown';

const props = defineProps<{
  markdown: string;
}>();

const renderedMarkdown = computed(() => renderMarkdown(props.markdown));

async function handleCopyClick(event: MouseEvent) {
  const target = event.target as HTMLElement | null;
  const button = target?.closest<HTMLButtonElement>('[data-md-copy="code"]');
  if (!button) return;

  const code = decodeMarkdownCode(button.dataset.code || '');
  if (!code) return;

  try {
    await navigator.clipboard.writeText(code);
    showToast('代码已复制');
  } catch {
    showToast({ type: 'fail', message: '复制失败' });
  }
}
</script>
