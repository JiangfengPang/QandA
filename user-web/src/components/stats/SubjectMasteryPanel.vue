<template>
  <article class="qstat-panel qstat-mastery-panel">
    <div class="qstat-panel-head">
      <div>
        <h2>科目掌握列表</h2>
        <p>用列表展示进度，比堆图表更适合复习。</p>
      </div>
      <RouterLink class="qstat-review-link" to="/library">去题库</RouterLink>
    </div>

    <div class="qstat-subject-list">
      <div v-for="subject in subjects" :key="subject.id" class="qstat-subject-card">
        <div class="qstat-subject-main">
          <strong>{{ subject.name }}</strong>
          <span>已做 {{ subject.answerCount || 0 }} / {{ subject.totalQuestionCount || 0 }} 题</span>
        </div>
        <div class="qstat-subject-progress">
          <i><b :style="{ width: `${subjectProgress(subject)}%` }"></b></i>
        </div>
        <div class="qstat-subject-meta">
          <span>正确率 <b>{{ subject.accuracy || 0 }}%</b></span>
          <span>错题 <b>{{ subject.wrongQuestionCount || 0 }}</b></span>
          <span>收藏 <b>{{ subject.favoriteCount || 0 }}</b></span>
        </div>
      </div>
      <div v-if="!subjects.length" class="qstat-empty-tip">暂无科目数据。</div>
    </div>
  </article>
</template>

<script setup lang="ts">
import type { SubjectStat } from '../../types/stats';
import { subjectProgress } from '../../composables/usePracticeStats';

defineProps<{ subjects: SubjectStat[] }>();
</script>
