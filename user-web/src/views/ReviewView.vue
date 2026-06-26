<template>
  <section class="qrev-page">
    <header class="qrev-topbar">
      <div>
        <div class="qrev-title">复盘</div>
      </div>
      <div class="qrev-mode-switch">
        <RouterLink class="qrev-mode-btn" :class="{ active: activeMode === 'wrong' }" to="/wrongs">错题</RouterLink>
        <RouterLink class="qrev-mode-btn" :class="{ active: activeMode === 'favorite' }" to="/favorites">收藏</RouterLink>
      </div>
    </header>

    <van-loading v-if="loading" class="center-loading" type="spinner">加载中...</van-loading>

    <section v-else class="qrev-board">
      <aside class="qrev-subject-rail">
        <button
          v-for="subject in subjects"
          :key="subject.id"
          type="button"
          class="qrev-subject-item"
          :class="{ active: selectedSubjectId === subject.id }"
          @click="selectSubject(subject.id)"
        >
          <span v-if="subjectReviewCount(subject)" class="qrev-subject-dot">{{ subjectReviewCount(subject) }}</span>
          <strong>{{ subject.name }}</strong>
          <span>{{ subjectReviewCount(subject) }} 题</span>
        </button>
      </aside>

      <main class="qrev-content">
        <section class="qrev-content-head qx-library-overview">
          <div class="qrev-content-tools qx-library-tools">
          <div class="qrev-stats-row qx-library-stat-row">
            <article>
              <span>{{ activeMode === 'wrong' ? '错题' : '收藏' }}</span>
              <strong>{{ displayQuestions.length }}</strong>
            </article>
            <article>
              <span>已做</span>
              <strong>{{ subjectStats.answerCount || 0 }}</strong>
            </article>
            <article>
              <span>正确率</span>
              <strong>{{ subjectStats.accuracy || 0 }}%</strong>
            </article>
          </div>

          <div class="qrev-head-actions qx-library-buttons">
            <RouterLink
              class="qrev-action-primary qx-btn"
              :class="{ disabled: !displayQuestions.length }"
              :to="firstPracticePath"
              @click.prevent="guardPractice"
            >
              {{ activeMode === 'wrong' ? '练习错题' : '练习收藏' }}
            </RouterLink>
            <button
              type="button"
              class="qrev-action-danger qx-btn"
              :disabled="!displayQuestions.length"
              @click="clearCurrentSubject"
            >
              {{ activeMode === 'wrong' ? '清空错题' : '清空收藏' }}
            </button>
          </div>
          </div>
        </section>

        <div v-if="!displayQuestions.length" class="qrev-empty">
          <h3>当前科目暂无{{ activeMode === 'wrong' ? '错题' : '收藏' }}</h3>
          <p>{{ activeMode === 'wrong' ? '答错题目后，会自动归类到这里。' : '在答题页点击收藏后，收藏题会自动归类到这里。' }}</p>
        </div>

        <div v-else class="qrev-list-wrap">
          <div class="qrev-list">
            <article v-for="item in displayQuestions" :key="item.id" class="qrev-card">
              <div class="qrev-chip-row">
                <span class="qrev-chip">{{ item.unitName || item.bankName || '单元' }}</span>
                <span class="qrev-chip type">{{ typeName(item.type) }}</span>
              </div>

              <h3 class="qrev-question" :title="item.question || item.stem">{{ item.question || item.stem }}</h3>

              <div class="qrev-answer-row">
                <span class="qrev-answer-label">正确答案：</span>
                <strong>{{ answerDisplay(item) }}</strong>
                <span v-if="speechItemsForQuestion(item).length" class="qrev-speech-actions">
                  <SpeakButton
                    v-for="speechItem in speechItemsForQuestion(item)"
                    :key="speechItem.key"
                    :text="speechItem.text"
                    :lang="speechItem.lang"
                    :label="speechItem.label"
                    :explicit="speechItem.explicit"
                  />
                </span>
              </div>

              <div class="qrev-card-actions">
                <button type="button" class="qrev-card-btn ghost" @click="removeCurrentItem(item)">
                  {{ activeMode === 'wrong' ? '移出错题' : '取消收藏' }}
                </button>
                <RouterLink class="qrev-card-btn blue" :to="singleQuestionPracticePath(item)">练习此题</RouterLink>
              </div>
            </article>
          </div>
        </div>
      </main>
    </section>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { showToast } from 'vant';
import { judgeAnswerKey, judgeOptionDisplay, optionKeyDisplay } from '../utils/question';
import { api } from '../api/request';
import SpeakButton from '../components/SpeakButton.vue';
import { speechItemsForQuestion } from '../utils/pronunciation';
import '../styles/mobile-lists.css';
import '../styles/review.css';

const route = useRoute();
const router = useRouter();
const subjects = ref<any[]>([]);
const wrongs = ref<any[]>([]);
const favorites = ref<any[]>([]);
const selectedSubjectId = ref('');
const loading = ref(true);
const subjectStats = ref<any>({});

const activeMode = computed(() => route.name === 'favorites' ? 'favorite' : 'wrong');
const selectedSubject = computed(() => subjects.value.find((subject) => subject.id === selectedSubjectId.value));
const sourceQuestions = computed(() => activeMode.value === 'favorite' ? favorites.value : wrongs.value);
const reviewCountMap = computed(() => {
  const map = new Map<string, number>();
  for (const subject of subjects.value) map.set(subject.id, 0);
  for (const item of sourceQuestions.value) {
    const subject = subjects.value.find((row) => matchesSubject(item, row));
    if (!subject) continue;
    map.set(subject.id, (map.get(subject.id) || 0) + 1);
  }
  return map;
});
const displayQuestions = computed(() => sourceQuestions.value.filter((item) => matchesSubject(item, selectedSubject.value)));
const firstPracticePath = computed(() => {
  const firstQuestion = displayQuestions.value[0];
  if (!firstQuestion?.bankId) return { name: 'library' };
  return {
    name: 'practice',
    params: { bankId: firstQuestion.bankId },
    query: {
      reviewMode: activeMode.value,
      subjectId: selectedSubjectId.value,
      from: activeMode.value === 'favorite' ? 'favorites' : 'wrongs'
    }
  };
});

onMounted(loadData);
watch(activeMode, () => {
  selectedSubjectId.value = firstSubjectWithData(activeMode.value);
  void refreshSubjectStats();
});
watch(selectedSubjectId, () => {
  void refreshSubjectStats();
});

async function loadData() {
  loading.value = true;
  try {
    const [subjectRows, wrongRows, favoriteRows] = await Promise.all([
      api.get<any[]>('/subjects'),
      api.get<any[]>('/practice/wrongs'),
      api.get<any[]>('/practice/favorites')
    ]);
    subjects.value = subjectRows;
    wrongs.value = wrongRows;
    favorites.value = favoriteRows;
    selectedSubjectId.value = firstSubjectWithData(activeMode.value);
    await refreshSubjectStats();
  } catch (e) {
    showToast({ type: 'fail', message: e instanceof Error ? e.message : '复盘数据加载失败' });
  } finally {
    loading.value = false;
  }
}

function selectSubject(id: string) {
  selectedSubjectId.value = id;
}

function matchesSubject(item: any, subject: any) {
  if (!subject) return true;
  return item.subjectId === subject.id || item.subjectName === subject.name;
}

function subjectReviewCount(subject: any) {
  return reviewCountMap.value.get(subject.id) || 0;
}

function firstSubjectWithData(mode: string) {
  const rows = mode === 'favorite' ? favorites.value : wrongs.value;
  const matched = subjects.value.find((subject) => rows.some((item) => matchesSubject(item, subject)));
  return matched?.id || subjects.value[0]?.id || '';
}

async function refreshSubjectStats() {
  if (!selectedSubjectId.value) {
    subjectStats.value = {};
    return;
  }
  try {
    subjectStats.value = await api.get<any>(`/practice/stats?subjectId=${selectedSubjectId.value}`);
  } catch {
    subjectStats.value = {};
  }
}

function singleQuestionPracticePath(item: any) {
  return {
    name: 'practice',
    params: { bankId: item.bankId },
    query: {
      questionId: item.id,
      from: activeMode.value === 'favorite' ? 'favorites' : 'wrongs'
    }
  };
}

function guardPractice() {
  if (!displayQuestions.value.length) return;
  router.push(firstPracticePath.value as any);
}

async function clearCurrentSubject() {
  if (!displayQuestions.value.length || !selectedSubjectId.value) return;
  const label = activeMode.value === 'wrong' ? '错题' : '收藏';
  const ok = window.confirm(`确认清空「${selectedSubject.value?.name || '当前科目'}」下的${label}吗？`);
  if (!ok) return;
  try {
    await api.delete(`/practice/${activeMode.value === 'wrong' ? 'wrongs' : 'favorites'}?subjectId=${selectedSubjectId.value}`);
    showToast({ type: 'success', message: `${label}已清空` });
    await loadData();
  } catch (e) {
    showToast({ type: 'fail', message: e instanceof Error ? e.message : `清空${label}失败` });
  }
}

async function removeCurrentItem(item: any) {
  try {
    await api.delete(`/practice/${activeMode.value === 'wrong' ? 'wrongs' : 'favorites'}/${item.id}`);
    if (activeMode.value === 'wrong') {
      wrongs.value = wrongs.value.filter((row) => row.id !== item.id);
    } else {
      favorites.value = favorites.value.filter((row) => row.id !== item.id);
    }
    showToast({ type: 'success', message: activeMode.value === 'wrong' ? '已移出错题' : '已取消收藏' });
    await refreshSubjectStats();
  } catch (e) {
    showToast({ type: 'fail', message: e instanceof Error ? e.message : '操作失败' });
  }
}

function typeName(type: string) {
  return ({ single: '单选题', multiple: '多选题', judge: '判断题', fill: '填空题' } as Record<string, string>)[type] || type || '题目';
}

function answerDisplay(question: any) {
  return answerArrayDisplay(question, question.answer);
}

function answerArrayDisplay(question: any, value: unknown) {
  const answers = Array.isArray(value) ? value.map((item: unknown) => String(item)) : [];
  return answers
    .map((answer: string) => {
      const option = (question.options || []).find((item: any) => {
        if (question.type === 'judge') return judgeAnswerKey(item.key) === judgeAnswerKey(answer) || judgeAnswerKey(item.keyLabel) === judgeAnswerKey(answer);
        return item.key === answer || item.keyLabel === answer;
      });
      if (option) return `${optionKeyDisplay(option, question.type)}. ${option.text}`;
      if (question.type === 'judge') return `${judgeAnswerKey(answer)}. ${judgeOptionDisplay(answer)}`;
      return answer;
    })
    .join('，') || '';
}
</script>
