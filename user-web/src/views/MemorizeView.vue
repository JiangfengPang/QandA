<template>
  <section class="view quiz-view qx-quiz-view qx-memorize-view">
    <div v-if="loading" class="practice-loading qx-loading-state">
      <van-loading type="spinner">加载背题内容...</van-loading>
    </div>

    <div v-else-if="!currentQuestion" class="empty-state qx-empty-state">
      <h2>当前科目暂无题目</h2>
      <p>返回题库选择其他科目或单元。</p>
      <button class="qx-action-btn primary" @click="returnToLibrary">返回题库</button>
    </div>

    <div v-else class="qx-quiz-screen qx-memorize-screen">
      <header class="qx-quiz-header">
        <div class="qx-practice-desktop-header">
          <div class="qx-quiz-header-row">
            <div class="qx-quiz-title-block">
              <span class="qx-quiz-device">背题模式 · 只看题目和正确答案</span>
              <h1>{{ desktopTitle }}</h1>
            </div>
            <div class="qx-quiz-header-side">
              <div class="qx-quiz-header-actions">
                <button class="qx-quiz-pill-btn solid" @click="returnToLibrary">返回题库</button>
                <button class="qx-quiz-pill-btn" @click="toggleOverview">题目列表</button>
              </div>
            </div>
          </div>
        </div>

        <div class="qx-practice-mobile-header" aria-label="移动端背题顶部栏">
          <div class="qx-mobile-nav-row">
            <button class="qx-mobile-back-btn" type="button" aria-label="返回题库" @click="returnToLibrary">
              <QxIcon name="chevron-left" />
            </button>
            <h1 class="qx-mobile-quiz-title">{{ mobileTitle }}</h1>
            <span class="qx-mobile-nav-spacer" aria-hidden="true"></span>
          </div>

          <div class="qx-mobile-progress-row">
            <span class="qx-mobile-question-count"><strong>{{ currentNumber }}</strong>/{{ questions.length }}</span>
            <div class="progress-line qx-mobile-progress-line" aria-label="背题进度">
              <span :style="{ width: progress + '%' }"></span>
            </div>
            <button class="qx-mobile-overview-btn" type="button" aria-label="题目列表" @click="toggleOverview">
              <QxIcon name="grid" />
            </button>
          </div>
        </div>
      </header>

      <div class="qx-quiz-layout qx-memorize-layout">
        <div class="qx-quiz-content">
          <div ref="memorizeMainRef" class="qx-quiz-main" @touchstart.passive="handleTouchStart" @touchend.passive="handleTouchEnd">
            <article class="qx-question-card qx-memorize-question-card is-font-standard" :class="{ 'is-multiple-question': currentQuestion.type === 'multiple' }">
              <div class="qx-question-card-head">
                <div class="qx-question-head-main">
                  <div class="qx-question-progress qx-desktop-question-progress">
                    <div class="qx-desktop-progress-row">
                      <span class="qx-desktop-question-count">{{ currentNumber }}/{{ questions.length }} · {{ currentUnitName }}</span>
                      <div class="progress-line">
                        <span :style="{ width: progress + '%' }"></span>
                      </div>
                      <span class="qx-memorize-mode-pill">背题</span>
                    </div>
                  </div>

                  <div class="qx-question-title-row">
                    <span class="pill qx-question-type-badge">{{ currentQuestionTypeBadge }}</span>
                    <span class="qx-question-inline-count">{{ currentNumber }}/{{ questions.length }}、</span>
                    <PythonMarkdown
                      v-if="isMarkdownStem"
                      class="qx-question-title qx-question-title-markdown qx-markdown-answer"
                      :markdown="questionStem(currentQuestion)"
                    />
                    <h2 v-else class="qx-question-title">{{ questionStem(currentQuestion) }}</h2>
                  </div>
                </div>
              </div>

              <section class="qx-memorize-answer-card">
                <div class="qx-memorize-answer-head">
                  <span>正确答案</span>
                </div>
                <PythonMarkdown class="qx-memorize-answer-body" :markdown="answerDisplay(currentQuestion)" />
              </section>
            </article>
          </div>

          <div class="qx-quiz-action-bar qx-memorize-action-bar">
            <button class="qx-action-btn ghost" :disabled="!canGoPrevious" @click="prevQuestion">上一题</button>
            <button class="qx-action-btn primary" @click="nextQuestion">{{ isLastQuestion ? '完成背题' : '下一题 →' }}</button>
          </div>
        </div>

        <button
          v-if="overviewOpen"
          class="overview-backdrop qx-overview-backdrop"
          aria-label="关闭题目列表"
          @click="toggleOverview"
        ></button>

        <aside class="quiz-overview qx-quiz-overview qx-memorize-overview" :class="{ open: overviewOpen }">
          <div class="qx-overview-head">
            <div>
              <h2>题目列表</h2>
              <p>{{ currentNumber }}/{{ questions.length }} 题</p>
            </div>
            <button class="qx-overview-close" aria-label="关闭题目列表" @click="toggleOverview">
              <QxIcon name="close" />
            </button>
          </div>

          <div class="overview-groups qx-overview-groups">
            <section v-for="group in overviewGroups" :key="group.unit" class="overview-group qx-overview-group">
              <h3>{{ group.unit }} <span>{{ group.items.length }} 题</span></h3>
              <div class="question-index-grid qx-question-index-grid">
                <button
                  v-for="item in group.items"
                  :key="item.index"
                  class="qx-overview-index-btn answered"
                  :class="{ active: item.index === currentIndex }"
                  :aria-label="`${item.unit}，第 ${item.number} 题`"
                  @click="jumpToQuestion(item.index)"
                >
                  <span class="qx-overview-number">{{ item.number }}</span>
                </button>
              </div>
            </section>
          </div>
        </aside>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { showToast } from 'vant';
import { api } from '../api/request';
import QxIcon from '../components/QxIcon.vue';
import { useVisualViewportHeight } from '../composables/useVisualViewportHeight';
import { judgeAnswerKey, judgeOptionDisplay, normalizeOptions, optionKeyDisplay, questionTypeText } from '../utils/question';
import { canGoToPreviousQuestion, practiceProgressNumber, practiceProgressPercent } from '../utils/practiceProgress';
import '../styles/practice.css';

const PythonMarkdown = defineAsyncComponent(() => import('../components/PythonMarkdown.vue'));

const route = useRoute();
const router = useRouter();
const bank = ref<any>(null);
const questions = ref<any[]>([]);
const currentIndex = ref(0);
const loading = ref(true);
const overviewOpen = ref(false);
const memorizeMainRef = ref<HTMLElement | null>(null);
const touchStartX = ref(0);
const touchStartY = ref(0);
const touchStartTime = ref(0);

const currentQuestion = computed(() => questions.value[currentIndex.value] || null);
const currentNumber = computed(() => practiceProgressNumber(currentIndex.value, questions.value.length));
const progress = computed(() => practiceProgressPercent(currentIndex.value, questions.value.length));
const canGoPrevious = computed(() => canGoToPreviousQuestion(currentIndex.value));
const isLastQuestion = computed(() => currentIndex.value >= questions.value.length - 1);
const currentUnitName = computed(() => String(currentQuestion.value?.unitName || currentQuestion.value?.bankName || '全部单元'));
const desktopTitle = computed(() => [bank.value?.subjectName, '背题模式'].filter(Boolean).join(' · '));
const mobileTitle = computed(() => [bank.value?.subjectName, '背题'].filter(Boolean).join(' - '));
const currentQuestionTypeBadge = computed(() => {
  const label = questionTypeText(currentQuestion.value);
  if (label.endsWith('题') || label === '题目') return label;
  return `${label}题`;
});
const isMarkdownStem = computed(() => {
  const question = currentQuestion.value;
  if (!question) return false;
  const stem = questionStem(question);
  return question.type === 'python' || /```|!\[|\[[^\]]+\]\(|\*\*|`/.test(stem);
});
const overviewGroups = computed(() => {
  const groups: Array<{ unit: string; items: Array<{ index: number; number: number; unit: string }> }> = [];
  const groupByUnit = new Map<string, Array<{ index: number; number: number; unit: string }>>();

  questions.value.forEach((question, index) => {
    const unit = String(question.unitName || question.bankName || '全部单元');
    if (!groupByUnit.has(unit)) groupByUnit.set(unit, []);
    groupByUnit.get(unit)!.push({ index, number: index + 1, unit });
  });

  groupByUnit.forEach((items, unit) => groups.push({ unit, items }));
  return groups;
});

useVisualViewportHeight();

onMounted(async () => {
  window.addEventListener('keydown', handleKeydown);
  try {
    const subjectId = String(route.params.subjectId || '').trim();
    const data = await api.get<{ bank: any; questions: any[] }>(`/subjects/${subjectId}/questions`);
    bank.value = data.bank;
    questions.value = Array.isArray(data.questions) ? data.questions : [];
  } catch (error) {
    showToast({ type: 'fail', message: error instanceof Error ? error.message : '背题内容加载失败' });
  } finally {
    loading.value = false;
  }
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown);
});

function returnToLibrary() {
  const subjectId = String(route.params.subjectId || bank.value?.subjectId || '').trim();
  router.push({ name: 'library', query: subjectId ? { subjectId } : {} });
}

function nextQuestion() {
  if (isLastQuestion.value) {
    returnToLibrary();
    return;
  }
  currentIndex.value += 1;
  resetMainScroll();
}

function prevQuestion() {
  if (!canGoPrevious.value) return;
  currentIndex.value -= 1;
  resetMainScroll();
}

function jumpToQuestion(index: number) {
  currentIndex.value = Math.max(0, Math.min(index, questions.value.length - 1));
  overviewOpen.value = false;
  resetMainScroll();
}

function toggleOverview() {
  overviewOpen.value = !overviewOpen.value;
}

function resetMainScroll() {
  void nextTick(() => {
    if (memorizeMainRef.value) memorizeMainRef.value.scrollTop = 0;
  });
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'ArrowRight') nextQuestion();
  if (event.key === 'ArrowLeft') prevQuestion();
}

function handleTouchStart(event: TouchEvent) {
  const touch = event.changedTouches[0];
  touchStartX.value = touch?.clientX || 0;
  touchStartY.value = touch?.clientY || 0;
  touchStartTime.value = Date.now();
}

function handleTouchEnd(event: TouchEvent) {
  const touch = event.changedTouches[0];
  if (!touch) return;
  const dx = touch.clientX - touchStartX.value;
  const dy = touch.clientY - touchStartY.value;
  const elapsed = Date.now() - touchStartTime.value;
  if (elapsed > 520 || Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
  if (dx < 0) nextQuestion();
  else prevQuestion();
}

function questionStem(question: any) {
  return String(question?.question || question?.stem || '').trim() || '本题暂无题干。';
}

function officialAnswer(question: any) {
  return Array.isArray(question?.answer)
    ? question.answer.map((item: unknown) => String(item || '').trim()).filter(Boolean)
    : [];
}

function answerDisplay(question: any) {
  const values = officialAnswer(question);
  if (!values.length) return '本题暂未录入正确答案。';
  if (question?.type === 'fill' || question?.type === 'python') return values.join('\n\n');

  const options = normalizeOptions(question?.options || []);
  return values
    .map((item: string) => {
      const option = options.find((candidate) => {
        if (question?.type === 'judge') {
          return judgeAnswerKey(candidate.key) === judgeAnswerKey(item) || judgeAnswerKey(candidate.keyLabel) === judgeAnswerKey(item);
        }
        return candidate.key === item || candidate.keyLabel === item;
      });
      if (option) return `${optionKeyDisplay(option, question?.type)}. ${option.text || judgeOptionDisplay(item)}`;
      if (question?.type === 'judge') return `${judgeAnswerKey(item)}. ${judgeOptionDisplay(item)}`;
      return item;
    })
    .join('\n');
}

</script>
