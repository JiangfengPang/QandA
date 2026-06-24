<template>
  <section class="qstat-page">
    <StatsTopbar
      :clearing="clearing"
      :disabled="clearing || loading"
      @clear="handleClearRecords"
    />

    <van-loading v-if="loading" class="center-loading" type="spinner">加载中...</van-loading>

    <template v-else>
      <section class="qstat-metric-grid">
        <StatsMetricCard
          label="题目总数"
          :value="stats.totalQuestionCount || 0"
          unit="题"
          :sub="`${stats.subjectCount || 0} 个科目 · ${stats.bankCount || 0} 个单元`"
          icon="database"
        />
        <StatsMetricCard
          label="已做题数"
          :value="stats.answerCount || 0"
          unit="题"
          :sub="`完成度 ${completionRate}%`"
          icon="check-circle"
          tone="green"
        />
        <StatsMetricCard
          label="正确率"
          :value="stats.accuracy || 0"
          unit="%"
          :sub="`正确 ${stats.correctCount || 0} 题 · 错误 ${stats.wrongCount || 0} 题`"
          icon="target"
          tone="purple"
        />
        <StatsMetricCard
          label="累计学习时长"
          :value="studyDurationLabel"
          sub="答题页面计时"
          icon="clock"
          tone="orange"
          compact
        />
        <StatsMetricCard
          label="错题数量"
          :value="stats.wrongQuestionCount || 0"
          unit="题"
          :sub="`收藏 ${stats.favoriteCount || 0} 题 · 未做 ${unansweredCount} 题`"
          icon="review"
          tone="soft"
        />
      </section>

      <section class="qstat-top-grid">
        <article class="qstat-panel qstat-trend-panel">
          <div class="qstat-panel-head">
            <div>
              <h2>近 7 天答题趋势</h2>
              <p>看最近是否持续练习，以及正确率是否有提升。</p>
            </div>
            <span>答题数 / 正确率</span>
          </div>
          <div ref="trendRef" class="qstat-chart"></div>
        </article>

        <LearningAdvicePanel :items="learningAdvice" />
      </section>

      <section class="qstat-bottom-grid">
        <article class="qstat-panel qstat-wrong-panel">
          <div class="qstat-panel-head">
            <div>
              <h2>错题分布</h2>
              <p>优先复习错题最多的科目。</p>
            </div>
            <RouterLink class="qstat-review-link" to="/wrongs">练习错题</RouterLink>
          </div>
          <div v-if="hasWrongDistribution" ref="wrongRef" class="qstat-chart"></div>
          <div v-else class="qstat-empty-tip">当前暂无错题分布，继续练习后这里会显示薄弱科目。</div>
        </article>

        <SubjectMasteryPanel :subjects="subjectMasteryList" />
      </section>

      <p class="qstat-footer-tip">建议先处理错题，再继续推进未做题目。</p>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted } from 'vue';
import StatsTopbar from '../components/stats/StatsTopbar.vue';
import StatsMetricCard from '../components/stats/StatsMetricCard.vue';
import LearningAdvicePanel from '../components/stats/LearningAdvicePanel.vue';
import SubjectMasteryPanel from '../components/stats/SubjectMasteryPanel.vue';
import { useStatsCharts } from '../composables/useStatsCharts';
import { usePracticeStats } from '../composables/usePracticeStats';
import '../styles/stats.css';

const {
  stats,
  loading,
  clearing,
  completionRate,
  unansweredCount,
  studyDurationLabel,
  wrongDistribution,
  hasWrongDistribution,
  subjectMasteryList,
  learningAdvice,
  loadStats,
  clearRecords
} = usePracticeStats();

const { trendRef, wrongRef, renderCharts, disposeCharts, resizeCharts } = useStatsCharts(stats, wrongDistribution, hasWrongDistribution);

onMounted(async () => {
  await refreshAndRender();
  window.addEventListener('resize', resizeCharts);
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', resizeCharts);
  disposeCharts();
});

async function refreshAndRender() {
  await loadStats();
  await nextTick();
  requestAnimationFrame(() => {
    renderCharts();
    setTimeout(resizeCharts, 80);
  });
}

async function handleClearRecords() {
  await clearRecords();
  await nextTick();
  requestAnimationFrame(() => {
    renderCharts();
    resizeCharts();
  });
}
</script>
