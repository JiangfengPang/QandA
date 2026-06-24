<template>
  <article class="qstat-panel qstat-advice-panel">
    <div class="qstat-panel-head">
      <div>
        <h2>学习建议</h2>
        <p>根据错题、正确率和未做题自动生成。</p>
      </div>
      <RouterLink class="qstat-review-link" to="/wrongs">查看复盘</RouterLink>
    </div>

    <div class="qstat-advice-list">
      <div v-for="item in items" :key="item.title" class="qstat-advice-item" :class="`is-${item.type}`">
        <i>
          <QxIcon :name="item.icon" :tone="adviceTone(item.type)" />
        </i>
        <div>
          <strong>{{ item.title }}</strong>
          <p>{{ item.desc }}</p>
        </div>
      </div>
    </div>
  </article>
</template>

<script setup lang="ts">
import type { LearningAdvice } from '../../types/stats';
import QxIcon from '../QxIcon.vue';

defineProps<{ items: LearningAdvice[] }>();

function adviceTone(type: LearningAdvice['type']) {
  if (type === 'danger') return 'red';
  if (type === 'warn') return 'orange';
  if (type === 'ok') return 'green';
  return 'blue';
}
</script>
