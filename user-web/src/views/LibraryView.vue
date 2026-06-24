<template>
  <section class="qx-page qx-library-page">
    <header class="qx-page-header">
      <div>
        <h1>题库</h1>
      </div>
    </header>

    <van-loading v-if="loadingSubjects" class="center-loading" type="spinner">加载中...</van-loading>
    <div v-else class="qx-library-shell">
      <aside class="qx-subject-rail">
        <button
          v-for="subject in subjects"
          :key="subject.id"
          class="qx-rail-subject"
          :class="{ active: selectedSubjectId === subject.id }"
          @click="selectSubject(subject.id)"
        >
          <strong>{{ subject.name }}</strong>
          <span>{{ subject.bankCount || 0 }} 单元</span>
        </button>
      </aside>

      <main class="qx-library-main">
        <section class="qx-library-overview">
          <div class="qx-library-tools">
            <div class="qx-library-stat-row">
              <article><span>题目</span><strong>{{ totalQuestions }}</strong></article>
              <article><span>已做</span><strong>{{ stats.answerCount || 0 }}</strong></article>
              <article><span>正确率</span><strong>{{ stats.accuracy || 0 }}%</strong></article>
            </div>
            <div class="qx-library-buttons">
              <button class="qx-btn memorize" :disabled="!canPracticeSubject" @click="startMemorizeMode">背题模式</button>
              <button class="qx-btn primary" :disabled="!canPracticeSubject" @click="startSubjectPractice('sequence')">顺序练习</button>
              <button class="qx-btn ghost" :disabled="!canPracticeSubject" @click="startSubjectPractice('random')">随机练习</button>
            </div>
          </div>
        </section>

        <van-loading v-if="loadingBanks" class="center-loading" type="spinner">读取题库...</van-loading>
        <div v-else-if="!banks.length" class="qx-library-empty">当前科目暂无题库，请稍后再试。</div>
        <div v-else class="qx-bank-card-grid">
          <RouterLink
            v-for="(bank, index) in banks"
            :key="bank.id"
            class="qx-unit-item-card"
            :class="{ 'has-wrong': wrongCount(bank) > 0, 'is-highlighted': index === 4 }"
            :to="`/practice/${bank.id}`"
          >
            <div class="qx-unit-item-head">
              <h3>{{ bank.name }}</h3>
              <span v-if="wrongCount(bank)">错题</span>
            </div>
            <p>{{ bank.questionCount || 0 }} 题 · {{ finishedCount(bank) }}/{{ bank.questionCount || 0 }} 已做 · {{ itemAccuracy(bank) }}% 正确率</p>
            <div class="qx-unit-progress">
              <i><b :style="{ width: `${progressPercent(bank)}%` }"></b></i>
              <em>{{ wrongCount(bank) ? `${wrongCount(bank)} 错题` : '无错题' }}</em>
            </div>
            <strong class="qx-unit-arrow" aria-hidden="true">
              <QxIcon name="chevron-right" />
            </strong>
          </RouterLink>
        </div>
      </main>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { showToast } from 'vant';
import { api } from '../api/request';
import QxIcon from '../components/QxIcon.vue';
import '../styles/mobile-lists.css';

const route = useRoute();
const router = useRouter();
const subjects = ref<any[]>([]);
const banks = ref<any[]>([]);
const stats = ref<any>({});
const selectedSubjectId = ref('');
const loadingSubjects = ref(true);
const loadingBanks = ref(false);
const totalQuestions = computed(() => banks.value.reduce((sum, bank) => sum + Number(bank.questionCount || 0), 0));
const canPracticeSubject = computed(() => Boolean(selectedSubjectId.value) && totalQuestions.value > 0);

onMounted(async () => {
  try {
    const subjectRows = await api.get<any[]>('/subjects');
    subjects.value = subjectRows;
    selectedSubjectId.value = String(route.params.subjectId || route.query.subjectId || subjectRows[0]?.id || '');
  } catch (e) {
    showToast({ type: 'fail', message: e instanceof Error ? e.message : '题库加载失败' });
  } finally {
    loadingSubjects.value = false;
  }
});

watch(selectedSubjectId, async (id) => {
  if (!id) return;
  loadingBanks.value = true;
  try {
    const [bankRows, subjectStats] = await Promise.all([
      api.get<any[]>(`/subjects/${id}/banks`),
      api.get<any>(`/practice/stats?subjectId=${id}`)
    ]);
    banks.value = bankRows;
    stats.value = subjectStats;
  } catch (e) {
    showToast({ type: 'fail', message: e instanceof Error ? e.message : '单元加载失败' });
  } finally {
    loadingBanks.value = false;
  }
}, { immediate: false });

function selectSubject(id: string) {
  selectedSubjectId.value = id;
  router.replace({ name: 'library', query: { subjectId: id } });
}

function startSubjectPractice(order: 'sequence' | 'random') {
  if (!canPracticeSubject.value) return;
  router.push({
    name: 'practice',
    params: { bankId: selectedSubjectId.value },
    query: {
      scope: 'subject',
      subjectId: selectedSubjectId.value,
      order
    }
  });
}

function startMemorizeMode() {
  if (!canPracticeSubject.value) return;
  router.push({
    name: 'memorize',
    params: { subjectId: selectedSubjectId.value }
  });
}

function finishedCount(bank: any) {
  return Number(bank.answeredCount || 0);
}

function itemAccuracy(bank: any) {
  return Number(bank.accuracy || 0);
}

function wrongCount(bank: any) {
  return Number(bank.wrongQuestionCount || bank.wrongCount || 0);
}

function progressPercent(bank: any) {
  const count = Number(bank.questionCount || 0);
  if (!count) return 0;
  return Math.min(100, Math.round((finishedCount(bank) / count) * 100));
}
</script>
