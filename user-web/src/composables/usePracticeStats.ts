import { computed, ref } from 'vue';
import { showConfirmDialog, showToast } from 'vant';
import { api } from '../api/request';
import type { LearningAdvice, StatsPayload, SubjectStat } from '../types/stats';
import { defaultStatsPayload } from '../types/stats';
import { formatDuration } from '../utils/duration';

export function subjectProgress(subject: SubjectStat) {
  const total = Number(subject.totalQuestionCount || 0);
  if (!total) return 0;
  return Math.min(100, Math.round((Number(subject.answerCount || 0) / total) * 100));
}

export function usePracticeStats() {
  const loading = ref(true);
  const clearing = ref(false);
  const stats = ref<StatsPayload>(defaultStatsPayload());

  const completionRate = computed(() => {
    const total = Number(stats.value.totalQuestionCount || 0);
    if (!total) return 0;
    return Math.min(100, Math.round((Number(stats.value.answerCount || 0) / total) * 100));
  });

  const unansweredCount = computed(() => Math.max(Number(stats.value.totalQuestionCount || 0) - Number(stats.value.answerCount || 0), 0));
  const studyDurationLabel = computed(() => formatDuration(Number(stats.value.totalDurationSeconds || 0)));

  const wrongDistribution = computed(() => {
    return [...(stats.value.subjectStats || [])]
      .filter((item) => Number(item.wrongQuestionCount || 0) > 0)
      .sort((a, b) => Number(b.wrongQuestionCount || 0) - Number(a.wrongQuestionCount || 0))
      .slice(0, 6);
  });

  const hasWrongDistribution = computed(() => wrongDistribution.value.length > 0);

  const subjectMasteryList = computed(() => {
    return [...(stats.value.subjectStats || [])]
      .sort((a, b) => {
        const aw = Number(a.wrongQuestionCount || 0);
        const bw = Number(b.wrongQuestionCount || 0);
        if (bw !== aw) return bw - aw;
        return Number(b.answerCount || 0) - Number(a.answerCount || 0);
      })
      .slice(0, 8);
  });

  const learningAdvice = computed<LearningAdvice[]>(() => {
    const advice: LearningAdvice[] = [];
    const topWrong = wrongDistribution.value[0];

    if (topWrong) {
      advice.push({
        type: 'danger',
        icon: 'warning',
        title: `优先复习 ${topWrong.name}`,
        desc: `该科目当前有 ${topWrong.wrongQuestionCount || 0} 道错题，建议先进入复盘页集中处理。`
      });
    }

    if (Number(stats.value.answerCount || 0) > 0 && Number(stats.value.accuracy || 0) < 60) {
      advice.push({
        type: 'warn',
        icon: 'percent',
        title: '先降速度，再提正确率',
        desc: `当前正确率为 ${stats.value.accuracy || 0}%，建议每题看完解析后再进入下一题。`
      });
    }

    if (unansweredCount.value > 0) {
      advice.push({
        type: 'blue',
        icon: 'practice',
        title: '继续推进未做题',
        desc: `还有 ${unansweredCount.value} 道题未完成，可以从题库页继续顺序练习。`
      });
    }

    if (!advice.length) {
      advice.push({
        type: 'ok',
        icon: 'sparkle',
        title: '当前状态不错',
        desc: '暂时没有明显薄弱项，可以继续保持日常练习节奏。'
      });
    }

    return advice.slice(0, 3);
  });

  async function loadStats() {
    loading.value = true;
    try {
      stats.value = await api.get<StatsPayload>('/practice/stats');
    } catch (error) {
      showToast({ type: 'fail', message: error instanceof Error ? error.message : '统计加载失败' });
    } finally {
      loading.value = false;
    }
  }

  async function clearRecords() {
    try {
      await showConfirmDialog({
        title: '清空记录',
        message: '将清空当前账号的答题记录、错题和收藏，是否继续？',
        confirmButtonText: '确认清空',
        cancelButtonText: '取消'
      });
    } catch {
      return;
    }

    clearing.value = true;
    try {
      await api.delete('/practice/records');
      showToast({ type: 'success', message: '记录已清空' });
      window.dispatchEvent(new Event('qanda:stats-updated'));
      await loadStats();
    } catch (error) {
      showToast({ type: 'fail', message: error instanceof Error ? error.message : '清空失败' });
    } finally {
      clearing.value = false;
    }
  }

  return {
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
  };
}
