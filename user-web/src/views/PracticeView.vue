<template>
  <section class="view quiz-view qx-quiz-view">
    <div v-if="loading" class="practice-loading qx-loading-state">
      <van-loading type="spinner">加载题目中...</van-loading>
    </div>

    <div v-else-if="!currentQuestion" class="empty-state qx-empty-state">
      <h2>这个题库暂无题目</h2>
      <p>返回题库选择其他单元继续练习。</p>
      <button class="qx-action-btn primary" @click="finishQuiz()">返回题库</button>
    </div>

    <div v-else class="qx-quiz-screen">
      <header class="qx-quiz-header">
        <div class="qx-practice-desktop-header">
          <div class="qx-quiz-header-row">
            <div class="qx-quiz-title-block">
              <h1>{{ quizTitle }}</h1>
            </div>
            <div class="qx-quiz-header-side">
              <div class="qx-quiz-header-actions">
                <button class="qx-quiz-pill-btn solid" @click="finishQuiz()">结束练习</button>
                <button v-if="showQuestionOverviewFeature" class="qx-quiz-pill-btn" @click="toggleQuizOverview">答题卡</button>
              </div>
            </div>
          </div>
        </div>

        <div class="qx-practice-mobile-header" aria-label="移动端答题顶部栏">
          <div class="qx-mobile-nav-row">
            <button class="qx-mobile-back-btn" type="button" aria-label="返回题库" @click="finishQuiz()">
              <QxIcon name="chevron-left" />
            </button>
            <h1 class="qx-mobile-quiz-title">{{ mobileQuizTitle }}</h1>
            <span class="qx-mobile-nav-spacer" aria-hidden="true"></span>
          </div>

          <div class="qx-mobile-progress-row">
            <span class="qx-mobile-question-count"><strong>{{ currentProgressNumber }}</strong>/{{ questions.length }}</span>
            <div class="progress-line qx-mobile-progress-line" aria-label="答题进度">
              <span :style="{ width: progress + '%' }"></span>
            </div>
            <button
              v-if="showQuestionOverviewFeature"
              class="qx-mobile-overview-btn"
              type="button"
              aria-label="答题卡"
              @click="toggleQuizOverview"
            >
              <QxIcon name="grid" />
            </button>
            <span v-else class="qx-mobile-nav-spacer" aria-hidden="true"></span>
          </div>
        </div>
      </header>

      <div class="qx-quiz-layout">
        <div class="qx-quiz-content">
          <div ref="quizMainRef" class="qx-quiz-main" @touchstart.passive="handleTouchStart" @touchend.passive="handleTouchEnd">
            <article
              class="qx-question-card"
              :class="[questionFontClass, { 'is-multiple-question': isMultipleQuestion }]"
            >
            <div class="qx-question-card-head">
              <div class="qx-question-head-main">
                <div class="qx-question-progress qx-desktop-question-progress">
                  <div class="qx-desktop-progress-row">
                    <span class="qx-desktop-question-count">{{ desktopQuestionProgressText }}</span>
                    <div class="progress-line">
                      <span :style="{ width: progress + '%' }"></span>
                    </div>
                    <button
                      class="qx-favorite-btn qx-desktop-favorite-btn"
                      :class="{ active: currentQuestion.favorite }"
                      type="button"
                      :aria-label="currentQuestion.favorite ? '取消收藏本题' : '收藏本题'"
                      @click="toggleFavorite"
                    >
                      <QxIcon class="qx-favorite-icon" name="star" :tone="currentQuestion.favorite ? 'gold' : 'slate'" />
                      <span>{{ currentQuestion.favorite ? '已收藏' : '收藏' }}</span>
                    </button>
                  </div>
                </div>

                <div class="qx-question-title-row">
                  <span class="pill qx-question-type-badge">{{ currentQuestionTypeBadge }}</span>
                  <span class="qx-question-inline-count">{{ currentProgressNumber }}/{{ questions.length }}、</span>
                  <PythonMarkdown
                    v-if="isPythonQuestion && questionStemText"
                    class="qx-question-title qx-question-title-markdown qx-markdown-answer"
                    :markdown="questionStemText"
                  />
                  <h2 v-else class="qx-question-title">{{ questionStemText }}</h2>
                </div>
              </div>
            </div>

            <div v-if="isPythonQuestion" class="qx-python-answer-card">
              <PythonMarkdown
                v-if="pythonAnswerMarkdown"
                :markdown="pythonAnswerMarkdown"
              />
              <div v-else class="qx-python-empty-answer">本题暂未录入正确答案。</div>
            </div>

            <div v-else-if="currentQuestion.type === 'fill'" class="fill-box qx-fill-box">
              <template v-if="isMultiFillQuestion">
                <div
                  v-for="(blank, index) in currentFillBlanks"
                  :key="blank.id || index"
                  class="qx-fill-blank-row"
                >
                  <label :for="fillInputId(index)">{{ fillBlankLabel(blank, index) }}</label>
                  <input
                    :id="fillInputId(index)"
                    v-model="fillAnswers[index]"
                    :disabled="submitted"
                    autocomplete="off"
                    :placeholder="blank.prompt || '输入答案'"
                    @keyup.enter="handleFillEnter(index)"
                  />
                </div>
              </template>
              <template v-else>
                <label for="fillAnswer">你的答案</label>
                <input
                  id="fillAnswer"
                  v-model="textAnswer"
                  :disabled="submitted"
                  autocomplete="off"
                  placeholder="输入答案，按回车确认"
                  @keyup.enter="submitAnswer"
                />
              </template>
            </div>

            <div v-else class="option-list qx-option-list">
              <button
                v-for="option in currentOptions"
                :key="option.key"
                class="option-button qx-option-button"
                :class="optionClass(option.key)"
                :disabled="submitted"
                @click="confirmOption(option.key)"
              >
                <span class="option-key">{{ optionKeyDisplay(option, currentQuestion.type) }}</span>
                <span class="option-text">{{ option.text }}</span>
              </button>
            </div>

            <div v-if="submitted && !isPythonQuestion && isCompactPracticeViewport" class="result-box qx-result-box" :class="{ correct: lastResult && lastResult.correct }">
              <div class="qx-result-answer-row">
                <span class="qx-answer-with-speech">
                  正确答案 <b class="qx-result-answer-correct">{{ currentOfficialAnswerSummary }}</b>
                  <span v-if="currentAnswerSpeechItems.length" class="qx-answer-speech-actions">
                    <SpeakButton
                      v-for="item in currentAnswerSpeechItems"
                      :key="item.key"
                      :text="item.text"
                      :lang="item.lang"
                      :label="item.label"
                      :explicit="item.explicit"
                    />
                  </span>
                </span>
                <span>{{ currentUserAnswerLabel }} <b :class="lastResult && lastResult.correct ? 'qx-result-answer-correct' : 'qx-result-answer-wrong'">{{ currentUserAnswerSummary }}</b></span>
                <QxIcon
                  class="qx-result-judge-icon"
                  :name="lastResult && lastResult.correct ? 'check-circle' : 'x-circle'"
                  :tone="lastResult && lastResult.correct ? 'green' : 'red'"
                />
              </div>
              <div v-if="showAnswerDetail" class="qx-simple-answer">
                <strong class="qx-analysis-title">解析</strong>
                <PythonMarkdown
                  v-if="explanation"
                  class="qx-explanation-text qx-explanation-markdown"
                  :markdown="explanation"
                />
                <p v-else class="qx-explanation-text">本题暂无解析。</p>
              </div>
              <button v-else class="qx-reveal-answer-btn" type="button" @click="explanationRevealed = true">查看解析</button>
            </div>
            </article>
          </div>

          <div class="qx-quiz-action-bar">
            <button class="qx-action-btn ghost" :disabled="!canGoPrevious" @click="prevQuestion">← 上一题</button>
            <button
              class="qx-action-btn primary"
              :disabled="primaryActionDisabled"
              @click="handlePrimaryQuizAction"
            >
              {{ primaryActionDisplayText }}
            </button>
            <button
              class="qx-mobile-favorite-btn"
              :class="{ active: currentQuestion.favorite }"
              type="button"
              :aria-label="currentQuestion.favorite ? '取消收藏本题' : '收藏本题'"
              @click="toggleFavorite"
            >
              <QxIcon class="qx-favorite-icon" name="star" :tone="currentQuestion.favorite ? 'gold' : 'slate'" />
              <span>{{ currentQuestion.favorite ? '已收藏' : '收藏此题' }}</span>
            </button>
          </div>

          <div v-if="submitted && !isPythonQuestion && !isCompactPracticeViewport" class="result-box qx-result-box" :class="{ correct: lastResult && lastResult.correct }">
            <div class="qx-result-answer-row">
              <span class="qx-answer-with-speech">
                正确答案 <b class="qx-result-answer-correct">{{ currentOfficialAnswerSummary }}</b>
                <span v-if="currentAnswerSpeechItems.length" class="qx-answer-speech-actions">
                  <SpeakButton
                    v-for="item in currentAnswerSpeechItems"
                    :key="item.key"
                    :text="item.text"
                    :lang="item.lang"
                    :label="item.label"
                    :explicit="item.explicit"
                  />
                </span>
              </span>
              <span>{{ currentUserAnswerLabel }} <b :class="lastResult && lastResult.correct ? 'qx-result-answer-correct' : 'qx-result-answer-wrong'">{{ currentUserAnswerSummary }}</b></span>
              <QxIcon
                class="qx-result-judge-icon"
                :name="lastResult && lastResult.correct ? 'check-circle' : 'x-circle'"
                :tone="lastResult && lastResult.correct ? 'green' : 'red'"
              />
            </div>
            <div v-if="showAnswerDetail" class="qx-simple-answer">
              <strong class="qx-analysis-title">解析</strong>
              <PythonMarkdown
                  v-if="explanation"
                  class="qx-explanation-text qx-explanation-markdown"
                  :markdown="explanation"
                />
              <p v-else class="qx-explanation-text">本题暂无解析。</p>
            </div>
            <button v-else class="qx-reveal-answer-btn" type="button" @click="explanationRevealed = true">查看解析</button>
          </div>
        </div>

        <button
          v-if="questions.length && quizOverviewOpen"
          class="overview-backdrop qx-overview-backdrop"
          aria-label="关闭答题卡"
          @click="toggleQuizOverview"
        ></button>

        <aside
          v-if="shouldRenderQuizOverview"
          ref="quizOverviewRef"
          class="quiz-overview qx-quiz-overview"
          :class="{ open: quizOverviewOpen }"
        >
          <div class="qx-overview-head">
            <div>
              <h2>答题卡</h2>
              <p>{{ currentProgressNumber }}/{{ questions.length }} 题</p>
            </div>
            <button class="qx-overview-close" aria-label="关闭答题卡" @click="toggleQuizOverview">
              <QxIcon name="close" />
            </button>
          </div>

          <div v-if="!isCompactPracticeViewport" class="qx-overview-summary">
            <span>答对：<b class="is-correct">{{ sessionCorrectCount }}题</b></span>
            <span>答错：<b class="is-wrong">{{ sessionWrongCount }}题</b></span>
            <span>正确率：<b>{{ sessionAccuracyText }}</b></span>
          </div>


          <div class="overview-groups qx-overview-groups">
            <section v-for="group in quizGroups" :key="group.type" class="overview-group qx-overview-group">
              <h3>{{ group.label }} <span>{{ group.items.length }} 题</span></h3>

              <div
                v-for="typeGroup in group.typeGroups"
                :key="typeGroup.type"
                class="qx-overview-type-group"
              >
                <h4 v-if="!typeGroup.hideLabel && (group.typeGroups.length > 1 || isSubjectPractice)">
                  {{ typeGroup.label }} <span>{{ typeGroup.items.length }} 题</span>
                </h4>
                <div class="question-index-grid qx-question-index-grid">
                  <button
                    v-for="item in typeGroup.items"
                    :key="item.index"
                    class="qx-overview-index-btn"
                    :class="overviewItemClass(item)"
                    :aria-label="overviewItemLabel(item)"
                    @click="jumpToQuestion(item.index)"
                  >
                    <span class="qx-overview-number">{{ item.number }}</span>
                    <span v-if="item.favorite" class="qx-overview-favorite-mark" aria-hidden="true">
                      <QxIcon name="star" tone="gold" />
                    </span>
                  </button>
                </div>
              </div>
            </section>
          </div>
        </aside>
      </div>
    </div>

    <van-dialog
      v-model:show="showAutoAdvanceHintDialog"
      class-name="qx-auto-advance-hint-dialog"
      title="答对自动下一题"
      confirm-button-text="知道了"
      @confirm="confirmAutoAdvanceHint"
    >
      <div class="qx-auto-advance-hint">
        <p>答对后自动进入下一题，可以在“我的 - 使用偏好”里开启或关闭。</p>
        <label class="qx-auto-advance-hint-check">
          <input v-model="dontShowAutoAdvanceHint" type="checkbox" />
          <span>不再提示</span>
        </label>
      </div>
    </van-dialog>
  </section>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { showConfirmDialog, showToast } from 'vant';
import { ApiError, api } from '../api/request';
import QxIcon from '../components/QxIcon.vue';
import SpeakButton from '../components/SpeakButton.vue';
import { useAuthStore } from '../stores/auth';
import { useVisualViewportHeight } from '../composables/useVisualViewportHeight';
import { isAnswerCorrect, isFillAnswerCorrect } from '../utils/answer';
import { judgeAnswerKey, judgeOptionDisplay, normalizeOptions, optionKeyDisplay, questionTypeText } from '../utils/question';
import {
  canGoToPreviousQuestion,
  getUnitQueueProgress,
  practiceProgressNumber,
  practiceProgressPercent
} from '../utils/practiceProgress';
import { buildPracticeOverviewGroups } from '../utils/practiceOverview';
import { speechItemsForQuestion } from '../utils/pronunciation';
import {
  applyPracticeResumeSnapshotQuestionOrder,
  applySavedPracticeQuestionOrder,
  buildPracticeResumeKey,
  clearPracticeResume,
  newerPracticeResume,
  practiceResumeSessionRecordsFromSnapshot,
  practiceResumeUpdatedAt,
  readPracticeResume,
  resolvePracticeResumeSnapshotIndex,
  savePracticeResume,
  writePracticeResumeSnapshot
} from '../utils/practiceResume';
import {
  clearRemotePracticeResume,
  fetchRemotePracticeResume,
  saveRemotePracticeResume
} from '../utils/practiceResumeRemote';
import {
  enqueuePendingAnswer,
  nextPendingRetryDelayMs,
  removePendingAnswer,
  resetAuthFailedPendingAnswers,
  selectDuePendingAnswers,
  summarizePendingAnswerQueue,
  updatePendingAnswer,
  type PendingAnswerRecord
} from '../utils/pendingAnswerQueue';
import type { PracticeSessionRecord } from '../types/practice';
import '../styles/practice.css';
import '../styles/practice-feedback.css';

const PythonMarkdown = defineAsyncComponent(() => import('../components/PythonMarkdown.vue'));

type FillBlankDefinition = {
  id: string;
  label: string;
  prompt: string;
  answer: string[];
};

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const bank = ref<any>(null);
const questions = ref<any[]>([]);
const currentIndex = ref(0);
const loading = ref(true);
const submitted = ref(false);
const selectedAnswers = ref<string[]>([]);
const textAnswer = ref('');
const fillAnswers = ref<string[]>([]);
const answer = ref<string[]>([]);
const explanation = ref('');
const answerTip = ref('');
const lastResult = ref<{ correct: boolean } | null>(null);
const quizOverviewOpen = ref(false);
const quizOverviewRef = ref<HTMLElement | null>(null);
const quizMainRef = ref<HTMLElement | null>(null);
const explanationRevealed = ref(false);
const showAutoAdvanceHintDialog = ref(false);
const dontShowAutoAdvanceHint = ref(false);
const COMPACT_PRACTICE_VIEWPORT_QUERY = '(max-width: 980px), (hover: none) and (pointer: coarse) and (max-device-width: 600px)';
const isCompactPracticeViewport = ref(
  typeof window !== 'undefined'
  && typeof window.matchMedia === 'function'
  && window.matchMedia(COMPACT_PRACTICE_VIEWPORT_QUERY).matches
);
const touchStartX = ref(0);
const touchStartY = ref(0);
const touchStartTime = ref(0);
const touchStartInHorizontalScroller = ref(false);
const quizSessionRecords = ref<Record<string, PracticeSessionRecord>>({});
const MAX_RECORDED_ANSWER_SECONDS = 30 * 60;
const CORRECT_ANSWER_AUTO_ADVANCE_MS = 160;
const AUTO_ADVANCE_HINT_DISMISSED_KEY = 'qanda_auto_advance_hint_dismissed';
const questionVisibleStartedAt = ref(Date.now());
const questionActiveElapsedMs = ref(0);
let practiceViewportMediaQuery: MediaQueryList | null = null;
let pendingAnswerSyncRunning = false;
let pendingAnswerRetryTimer: ReturnType<typeof setTimeout> | null = null;
let correctAnswerAutoAdvanceTimer: ReturnType<typeof setTimeout> | null = null;
let remotePracticeResumeSaveTimer: ReturnType<typeof setTimeout> | null = null;
let questionScrollResetFrame: number | undefined;
let practiceResumeReady = false;

const currentQuestion = computed(() => questions.value[currentIndex.value] || null);
const currentOptions = computed(() => normalizeOptions(currentQuestion.value?.options || []));
const isMultipleQuestion = computed(() => currentQuestion.value?.type === 'multiple');
const currentQuestionTypeBadge = computed(() => {
  const label = questionTypeText(currentQuestion.value);
  if (label.endsWith('题') || label === '题目') return label;
  return `${label}题`;
});
const isFillQuestion = computed(() => currentQuestion.value?.type === 'fill');
const isPythonQuestion = computed(() => currentQuestion.value?.type === 'python');
const questionStemText = computed(() => String(currentQuestion.value?.question || currentQuestion.value?.stem || '').trim());
const currentFillBlanks = computed(() => fillBlankDefinitions(currentQuestion.value));
const isMultiFillQuestion = computed(() => currentFillBlanks.value.length > 1);
const pythonAnswerMarkdown = computed(() => {
  const raw = Array.isArray(currentQuestion.value?.answer) ? currentQuestion.value.answer[0] : '';
  return String(raw || currentQuestion.value?.pythonAnswer || '').trim();
});
const needsManualConfirm = computed(() => (isMultipleQuestion.value || isFillQuestion.value) && !submitted.value);
const primaryActionText = computed(() => {
  if (needsManualConfirm.value) return '确认答案';
  return currentIndex.value === questions.value.length - 1 ? '完成练习' : '下一题';
});
const primaryActionDisplayText = computed(() => {
  if (primaryActionText.value === '下一题') return '下一题 →';
  return primaryActionText.value;
});
const primaryActionDisabled = computed(() => {
  if (!needsManualConfirm.value) return false;
  if (isFillQuestion.value) return !fillUserAnswerValues(currentQuestion.value).every((item) => String(item || '').trim());
  return selectedAnswers.value.length === 0;
});
const currentProgressNumber = computed(() => practiceProgressNumber(currentIndex.value, questions.value.length));
const progress = computed(() => practiceProgressPercent(currentIndex.value, questions.value.length));
const canGoPrevious = computed(() => canGoToPreviousQuestion(currentIndex.value));
const currentUnitProgress = computed(() => getUnitQueueProgress(questions.value, currentIndex.value));
const answeredQuestionCount = computed(() => questions.value.filter((question) => question.type === 'python' || quizSessionRecords.value[question.id]).length);
const unansweredQuestionCount = computed(() => Math.max(questions.value.length - answeredQuestionCount.value, 0));
const sessionCorrectCount = computed(() => Object.values(quizSessionRecords.value).filter((record) => record.correct === true).length);
const sessionWrongCount = computed(() => Object.values(quizSessionRecords.value).filter((record) => record.correct === false).length);
const sessionAccuracyText = computed(() => {
  const total = sessionCorrectCount.value + sessionWrongCount.value;
  if (!total) return '0.00%';
  return `${((sessionCorrectCount.value / total) * 100).toFixed(2)}%`;
});
const currentOfficialAnswerSummary = computed(() => answerKeySummary(currentQuestion.value, getOfficialAnswer(currentQuestion.value)));
const currentAnswerSpeechItems = computed(() => submitted.value ? speechItemsForQuestion(currentQuestion.value) : []);
const currentUserAnswerLabel = computed(() => currentQuestion.value?.type === 'fill' ? '您输入' : '您选择');
const currentUserAnswerSummary = computed(() => {
  const question = currentQuestion.value;
  if (!question) return '-';
  const values = question.type === 'fill' ? fillUserAnswerValues(question) : selectedAnswers.value;
  return answerKeySummary(question, values);
});
const practiceQuestionId = computed(() => String(route.query.questionId || route.query.qid || '').trim());
const practiceScope = computed(() => String(route.query.scope || '').trim());
const practiceOrder = computed(() => String(route.query.order || '').trim());
const isSubjectPractice = computed(() => practiceScope.value === 'subject');
const reviewPracticeMode = computed(() => {
  const mode = String(route.query.reviewMode || '').trim();
  if (mode === 'wrong' || mode === 'wrongs') return 'wrong';
  if (mode === 'favorite' || mode === 'favorites') return 'favorite';
  return '';
});
const reviewPracticeSubjectId = computed(() => String(route.query.subjectId || '').trim());
const reviewPracticeLabel = computed(() => reviewPracticeMode.value === 'favorite' ? '收藏专项练习' : '错题专项练习');
const practiceReturnRoute = computed(() => {
  const from = String(route.query.from || '').trim();
  if (from === 'favorites') return { name: 'favorites' };
  if (from === 'wrongs') return { name: 'wrongs' };
  return null;
});
const quizTitle = computed(() => [bank.value?.subjectName, bank.value?.name].filter(Boolean).join(' '));
const mobileQuizTitle = computed(() => [bank.value?.subjectName, bank.value?.name].filter(Boolean).join(' - '));
const pendingAnswerUserKey = computed(() => auth.user?.id || auth.user?.email || auth.user?.username || '');
const practiceResumeKey = computed(() => {
  if (practiceQuestionId.value) return '';

  const userKey = pendingAnswerUserKey.value || 'anonymous';
  if (reviewPracticeMode.value) {
    return buildPracticeResumeKey(userKey, [
      'practice',
      'review',
      reviewPracticeMode.value,
      reviewPracticeSubjectId.value || 'all'
    ]);
  }

  if (isSubjectPractice.value) {
    return buildPracticeResumeKey(userKey, [
      'practice',
      'subject',
      route.query.subjectId || route.params.bankId || '',
      practiceOrder.value || 'sequence'
    ]);
  }

  return buildPracticeResumeKey(userKey, ['practice', 'bank', route.params.bankId || '']);
});

const preferences = computed(() => auth.user?.preferences || {
  autoShowExplanation: true,
  autoAddWrong: true,
  autoAdvanceOnCorrect: true,
  questionFontSize: 'standard',
  showQuestionOverview: true
});
const showQuestionOverviewFeature = computed(() => preferences.value.showQuestionOverview);
const autoAdvanceOnCorrectFeature = computed(() => preferences.value.autoAdvanceOnCorrect !== false);
const showAnswerDetail = computed(() => submitted.value && (preferences.value.autoShowExplanation || explanationRevealed.value));
const questionFontClass = computed(() => `is-font-${preferences.value.questionFontSize || 'standard'}`);
const shouldRenderQuizOverview = computed(() => (
  questions.value.length > 0
  && showQuestionOverviewFeature.value
  && (!isCompactPracticeViewport.value || quizOverviewOpen.value)
));

const overviewItems = computed(() => {
  if (!shouldRenderQuizOverview.value) return [];
  return questions.value.map((question, index) => {
    const record = quizSessionRecords.value[question.id];
    const answered = question.type === 'python' || Boolean(record);
    const status = !answered
      ? 'unanswered'
      : record?.correct === true
        ? 'correct'
        : record?.correct === false
          ? 'wrong'
          : 'answered';

    return {
      index,
      number: index + 1,
      question,
      answered,
      correct: record?.correct,
      status,
      favorite: Boolean(question.favorite)
    };
  });
});

const quizGroups = computed(() => {
  if (!shouldRenderQuizOverview.value) return [];
  return buildPracticeOverviewGroups(overviewItems.value, {
    isSubjectPractice: isSubjectPractice.value,
    isRandomOrder: practiceOrder.value === 'random',
    questionTypeLabel: questionTypeText
  });
});

const desktopQuestionProgressText = computed(() => {
  if (!isSubjectPractice.value) return `第 ${currentProgressNumber.value} / ${questions.value.length} 题`;

  const unitProgress = currentUnitProgress.value;
  if (!unitProgress) return `总进度 ${currentProgressNumber.value} / ${questions.value.length}`;

  return `本单元第 ${unitProgress.current} / ${unitProgress.total} 题 · 总进度 ${currentProgressNumber.value} / ${questions.value.length}`;
});

function overviewItemClass(item: any) {
  return {
    active: currentIndex.value === item.index,
    unanswered: item.status === 'unanswered',
    answered: item.status === 'answered',
    correct: item.status === 'correct',
    wrong: item.status === 'wrong',
    favorite: item.favorite
  };
}

function overviewItemLabel(item: any) {
  const statusText = ({
    unanswered: '未答',
    answered: '已答',
    correct: '答对',
    wrong: '答错'
  } as Record<string, string>)[item.status] || '未答';
  const currentText = currentIndex.value === item.index ? '，当前题' : '';
  const favoriteText = item.favorite ? '，已收藏' : '';
  const unitText = isSubjectPractice.value && (item.question?.unitName || item.question?.bankName) ? `${item.question.unitName || item.question.bankName}，` : '';
  return `${unitText}${questionTypeText(item.question)}，第 ${item.number} 题，${statusText}${currentText}${favoriteText}`;
}

function updatePracticeViewportMode() {
  if (typeof window === 'undefined') return;
  isCompactPracticeViewport.value = Boolean(practiceViewportMediaQuery?.matches);
}

function setupPracticeViewportQuery() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
  practiceViewportMediaQuery = window.matchMedia(COMPACT_PRACTICE_VIEWPORT_QUERY);
  updatePracticeViewportMode();
  if (typeof practiceViewportMediaQuery.addEventListener === 'function') {
    practiceViewportMediaQuery.addEventListener('change', updatePracticeViewportMode);
  } else {
    practiceViewportMediaQuery.addListener(updatePracticeViewportMode);
  }
}

function teardownPracticeViewportQuery() {
  if (!practiceViewportMediaQuery) return;
  if (typeof practiceViewportMediaQuery.removeEventListener === 'function') {
    practiceViewportMediaQuery.removeEventListener('change', updatePracticeViewportMode);
  } else {
    practiceViewportMediaQuery.removeListener(updatePracticeViewportMode);
  }
  practiceViewportMediaQuery = null;
}

useVisualViewportHeight();

onMounted(async () => {
  setupPracticeViewportQuery();
  document.addEventListener('visibilitychange', handleVisibilityChange);
  if (typeof window !== 'undefined') {
    window.addEventListener('online', handlePendingAnswerOnline);
    window.addEventListener('pagehide', handlePracticePageHide);
  }
  try {
    if (reviewPracticeMode.value) {
      await loadReviewPracticeQuestions();
    } else {
      await loadBankPracticeQuestions();
    }
    await restoreSavedPracticeResume();
  } catch (e) {
    showToast({ type: 'fail', message: e instanceof Error ? e.message : '题目加载失败' });
    practiceResumeReady = true;
  } finally {
    loading.value = false;
    void nextTick(() => maybeShowAutoAdvanceHint());
    void syncPendingAnswers('practice-enter', { resetAuthFailures: true });
  }
});

onBeforeUnmount(() => {
  document.removeEventListener('visibilitychange', handleVisibilityChange);
  if (typeof window !== 'undefined') {
    window.removeEventListener('online', handlePendingAnswerOnline);
    window.removeEventListener('pagehide', handlePracticePageHide);
  }
  if (typeof window !== 'undefined' && questionScrollResetFrame !== undefined) {
    window.cancelAnimationFrame(questionScrollResetFrame);
  }
  clearCorrectAnswerAutoAdvanceTimer();
  clearPendingAnswerRetryTimer();
  flushRemotePracticeResumeSync();
  teardownPracticeViewportQuery();
});

watch(() => currentQuestion.value?.id, () => {
  clearCorrectAnswerAutoAdvanceTimer();
  restoreQuestionState();
  resetQuestionTimer();
  resetQuestionScrollPosition();
}, { immediate: true });

watch(() => [currentIndex.value, currentQuestion.value?.id, questions.value.length, practiceResumeKey.value], () => {
  persistCurrentPracticeResume();
});

watch(() => pendingAnswerUserKey.value, () => {
  void syncPendingAnswers('auth-change', { resetAuthFailures: true });
});

watch(() => autoAdvanceOnCorrectFeature.value, (enabled) => {
  if (!enabled) clearCorrectAnswerAutoAdvanceTimer();
});


async function loadBankPracticeQuestions() {
  if (isSubjectPractice.value) {
    const subjectId = String(route.query.subjectId || route.params.bankId || '').trim();
    const data = await api.get<{ bank: any; questions: any[] }>(`/subjects/${subjectId}/questions`);
    bank.value = {
      ...data.bank,
      name: practiceOrder.value === 'random' ? '全部单元随机练习' : '全部单元顺序练习'
    };
    questions.value = preparePracticeQuestions(data.questions || []);
    return;
  }

  const data = await api.get<{ bank: any; questions: any[] }>(`/banks/${route.params.bankId}/questions`);
  bank.value = data.bank;
  questions.value = resolvePracticeQuestions(data.questions || []);
}

async function loadReviewPracticeQuestions() {
  const endpoint = reviewPracticeMode.value === 'favorite' ? '/practice/favorites' : '/practice/wrongs';
  const rows = await api.get<any[]>(endpoint);
  const scopedRows = filterReviewPracticeQuestions(rows || []);
  bank.value = buildReviewPracticeBank(scopedRows);
  questions.value = resolvePracticeQuestions(scopedRows);
}

function filterReviewPracticeQuestions(rows: any[]) {
  const subjectId = reviewPracticeSubjectId.value;
  if (!subjectId) return rows;
  return rows.filter((question) => String(question.subjectId || '') === subjectId);
}

function buildReviewPracticeBank(rows: any[]) {
  const first = rows[0] || {};
  return {
    id: String(route.params.bankId || ''),
    subjectId: first.subjectId || reviewPracticeSubjectId.value || undefined,
    subjectName: first.subjectName || undefined,
    name: reviewPracticeLabel.value
  };
}

function resetQuestionTimer() {
  questionActiveElapsedMs.value = 0;
  questionVisibleStartedAt.value = Date.now();
}

function pauseQuestionTimer() {
  const startedAt = questionVisibleStartedAt.value;
  if (!startedAt) return;
  questionActiveElapsedMs.value += Math.max(Date.now() - startedAt, 0);
  questionVisibleStartedAt.value = 0;
}

function resumeQuestionTimer() {
  if (questionVisibleStartedAt.value) return;
  questionVisibleStartedAt.value = Date.now();
}

function handleVisibilityChange() {
  if (document.visibilityState === 'hidden') {
    pauseQuestionTimer();
  } else {
    resumeQuestionTimer();
  }
}

function handlePracticePageHide() {
  pauseQuestionTimer();
  flushRemotePracticeResumeSync({ keepalive: true });
}

function currentQuestionDurationSeconds() {
  const visibleElapsed = questionVisibleStartedAt.value ? Math.max(Date.now() - questionVisibleStartedAt.value, 0) : 0;
  const seconds = Math.round((questionActiveElapsedMs.value + visibleElapsed) / 1000);
  return Math.max(0, Math.min(seconds, MAX_RECORDED_ANSWER_SECONDS));
}

function preparePracticeQuestions(rows: any[]) {
  const resolved = resolvePracticeQuestions(rows);
  if (practiceQuestionId.value || practiceOrder.value !== 'random') return resolved;
  const savedOrder = applySavedPracticeQuestionOrder(practiceResumeKey.value, resolved);
  if (savedOrder) return savedOrder;
  return shuffleQuestions(resolved);
}

function shuffleQuestions(rows: any[]) {
  const result = [...rows];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function resolvePracticeQuestions(rows: any[]) {
  const targetId = practiceQuestionId.value;
  if (!targetId) return rows;

  const matched = rows.find((question) => String(question.id) === targetId);
  if (!matched) {
    showToast({ type: 'fail', message: '未找到指定题目，已打开完整题库' });
    return rows;
  }

  currentIndex.value = 0;
  return [matched];
}

async function restoreSavedPracticeResume() {
  const key = practiceResumeKey.value;
  const localSnapshot = readPracticeResume(key);
  const remoteSnapshot = await loadRemotePracticeResumeSnapshot(key);
  const selectedSnapshot = newerPracticeResume(localSnapshot, remoteSnapshot);

  if (selectedSnapshot) {
    writePracticeResumeSnapshot(key, selectedSnapshot);
    const orderedQuestions = applyPracticeResumeSnapshotQuestionOrder(selectedSnapshot, questions.value);
    if (orderedQuestions) questions.value = orderedQuestions;
  }

  quizSessionRecords.value = practiceResumeSessionRecordsFromSnapshot(selectedSnapshot, questions.value);
  enqueueResumedPendingAnswers();
  const savedIndex = resolvePracticeResumeSnapshotIndex(selectedSnapshot, questions.value);
  if (savedIndex !== null) currentIndex.value = savedIndex;
  practiceResumeReady = true;
  restoreQuestionState();
  persistCurrentPracticeResume();
}

function persistCurrentPracticeResume() {
  if (!practiceResumeReady) return;
  const snapshot = savePracticeResume(practiceResumeKey.value, questions.value, currentIndex.value, quizSessionRecords.value);
  if (snapshot) scheduleRemotePracticeResumeSync();
}

async function clearCurrentPracticeResume() {
  const key = practiceResumeKey.value;
  clearRemotePracticeResumeSaveTimer();
  clearPracticeResume(key);
  try {
    await clearRemotePracticeResume(key);
  } catch {
    // 本地清理已完成；远程删除失败时，下次完成练习会再次尝试覆盖/清理。
  }
}

async function loadRemotePracticeResumeSnapshot(key: string) {
  try {
    return await fetchRemotePracticeResume(key);
  } catch {
    return null;
  }
}

function clearRemotePracticeResumeSaveTimer() {
  if (!remotePracticeResumeSaveTimer) return;
  clearTimeout(remotePracticeResumeSaveTimer);
  remotePracticeResumeSaveTimer = null;
}

function scheduleRemotePracticeResumeSync() {
  if (!practiceResumeReady || !practiceResumeKey.value) return;
  clearRemotePracticeResumeSaveTimer();
  remotePracticeResumeSaveTimer = setTimeout(() => {
    remotePracticeResumeSaveTimer = null;
    void syncRemotePracticeResume();
  }, 300);
}

function flushRemotePracticeResumeSync(options: { keepalive?: boolean } = {}) {
  clearRemotePracticeResumeSaveTimer();
  void syncRemotePracticeResume(options);
}

async function syncRemotePracticeResume(options: { keepalive?: boolean } = {}) {
  const key = practiceResumeKey.value;
  const snapshot = readPracticeResume(key);
  if (!key || !snapshot) return;

  const sentUpdatedAt = practiceResumeUpdatedAt(snapshot);
  try {
    const savedSnapshot = await saveRemotePracticeResume(key, snapshot, options.keepalive ? { keepalive: true } : {});
    const currentSnapshot = readPracticeResume(key);
    if (savedSnapshot && practiceResumeUpdatedAt(currentSnapshot) <= sentUpdatedAt) {
      writePracticeResumeSnapshot(key, savedSnapshot);
    }
  } catch {
    // 网络不可用时保留本地快照，后续切题/答题会再次尝试同步。
  }
}

function enqueueResumedPendingAnswers() {
  const userKey = pendingAnswerUserKey.value;
  if (!userKey) return;

  Object.entries(quizSessionRecords.value).forEach(([questionId, record]) => {
    if (!record.clientAnswerId || record.syncStatus === 'synced') return;
    enqueuePendingAnswer(userKey, {
      clientAnswerId: record.clientAnswerId,
      questionId,
      selectedAnswer: record.userAnswer,
      isCorrect: record.correct,
      answeredAt: new Date().toISOString(),
      retryCount: 0,
      lastTriedAt: '',
      status: 'pending',
      durationSeconds: 0
    });
  });
}

function normalizeStringArray(value: unknown) {
  return Array.isArray(value) ? value.map((item) => String(item).trim()).filter(Boolean) : [];
}

function fillBlankDefinitions(question: any): FillBlankDefinition[] {
  if (question?.type !== 'fill') return [];
  const blanks = Array.isArray(question.fillBlanks) ? question.fillBlanks : [];
  if (blanks.length) {
    return blanks
      .map((blank: any, index: number) => ({
        id: String(blank?.id || `blank-${index + 1}`),
        label: String(blank?.label || index + 1),
        prompt: String(blank?.prompt || ''),
        answer: normalizeStringArray(blank?.answer)
      }))
      .filter((blank: any) => blank.answer.length > 0);
  }
  const answerValues = normalizeStringArray(question.answer);
  return answerValues.length ? [{ id: 'blank-1', label: '1', prompt: '', answer: answerValues }] : [];
}

function fillBlankLabel(blank: FillBlankDefinition | undefined, index: number) {
  const label = String(blank?.label || index + 1).trim();
  return `第 ${label} 空`;
}

function fillInputId(index: number) {
  return `fillAnswer-${index + 1}`;
}

function fillUserAnswerValues(question: any): string[] {
  if (question?.type !== 'fill') return [];
  const blanks = fillBlankDefinitions(question);
  if (blanks.length > 1) return blanks.map((_blank: FillBlankDefinition, index: number) => String(fillAnswers.value[index] || ''));
  return [String(textAnswer.value || '')];
}

function fillAnswerGroupsForCheck(question: any): string[] | string[][] {
  const blanks = fillBlankDefinitions(question);
  if (blanks.length > 1) return blanks.map((blank: FillBlankDefinition) => blank.answer);
  return blanks[0]?.answer || normalizeStringArray(question?.answer);
}

function fillOfficialAnswerValues(question: any): string[] {
  const blanks = fillBlankDefinitions(question);
  if (blanks.length > 1) return blanks.map((blank: FillBlankDefinition) => blank.answer.join(' / '));
  return blanks[0]?.answer || normalizeStringArray(question?.answer);
}

function getOfficialAnswer(question: any): string[] {
  const source = answer.value.length
    ? answer.value
    : question?.type === 'fill'
      ? fillOfficialAnswerValues(question)
      : Array.isArray(question?.answer)
        ? question.answer
        : [];
  return source.map((item: unknown) => String(item));
}

function answerDisplay(question: any) {
  const official = getOfficialAnswer(question);
  if (question.type === 'fill') {
    const blanks = fillBlankDefinitions(question);
    if (blanks.length > 1) {
      return official.map((item: string, index: number) => `${fillBlankLabel(blanks[index], index)}：${item}`).join('\n');
    }
    return official.join(' / ');
  }
  return official
    .map((item: string) => {
      const option = normalizeOptions(question.options || []).find((candidate) => {
        if (question.type === 'judge') return judgeAnswerKey(candidate.key) === judgeAnswerKey(item) || judgeAnswerKey(candidate.keyLabel) === judgeAnswerKey(item);
        return candidate.key === item || candidate.keyLabel === item;
      });
      if (option) return `${optionKeyDisplay(option, question.type)}. ${option.text || judgeOptionDisplay(item)}`;
      if (question.type === 'judge') return `${judgeAnswerKey(item)}. ${judgeOptionDisplay(item)}`;
      return item;
    })
    .join('，');
}

function answerKeySummary(question: any, values: string[]) {
  if (!question || !values.length) return '-';
  const normalizedValues = values.map((item) => String(item || '').trim()).filter(Boolean);
  if (!normalizedValues.length) return '-';
  if (question.type === 'fill') {
    const blanks = fillBlankDefinitions(question);
    if (blanks.length > 1) {
      return blanks
        .map((blank: any, index: number) => `${fillBlankLabel(blank, index)}：${String(values[index] || '').trim() || '-'}`)
        .join('；');
    }
    return normalizedValues.join(' / ');
  }

  const options = normalizeOptions(question.options || []);
  return normalizedValues
    .map((item) => {
      const option = options.find((candidate) => {
        if (question.type === 'judge') return judgeAnswerKey(candidate.key) === judgeAnswerKey(item) || judgeAnswerKey(candidate.keyLabel) === judgeAnswerKey(item);
        return candidate.key === item || candidate.keyLabel === item;
      });
      if (option) return optionKeyDisplay(option, question.type);
      if (question.type === 'judge') return judgeAnswerKey(item);
      return item;
    })
    .join('、');
}

function restoreQuestionState() {
  const question = currentQuestion.value;
  answerTip.value = '';
  explanationRevealed.value = false;
  if (!question) {
    selectedAnswers.value = [];
    textAnswer.value = '';
    fillAnswers.value = [];
    submitted.value = false;
    lastResult.value = null;
    answer.value = [];
    explanation.value = '';
    return;
  }

  const record = quizSessionRecords.value[question.id];
  if (!record) {
    selectedAnswers.value = [];
    textAnswer.value = '';
    fillAnswers.value = [];
    submitted.value = false;
    lastResult.value = null;
    answer.value = [];
    explanation.value = '';
    return;
  }

  selectedAnswers.value = question.type === 'fill' ? [] : [...record.userAnswer];
  textAnswer.value = question.type === 'fill' ? record.userAnswer[0] || '' : '';
  fillAnswers.value = question.type === 'fill' ? [...record.userAnswer] : [];
  submitted.value = true;
  lastResult.value = { correct: record.correct };
  answer.value = [...record.answer];
  explanation.value = record.explanation;
}

function confirmOption(key: string) {
  answerTip.value = '';
  if (!currentQuestion.value || submitted.value) return;

  if (currentQuestion.value.type === 'multiple') {
    selectedAnswers.value = selectedAnswers.value.includes(key)
      ? selectedAnswers.value.filter((item) => item !== key)
      : [...selectedAnswers.value, key];
    return;
  }

  selectedAnswers.value = [key];
  void submitAnswer();
}

function handleFillEnter(index: number) {
  if (!isMultiFillQuestion.value) {
    void submitAnswer();
    return;
  }
  const nextIndex = index + 1;
  if (nextIndex < currentFillBlanks.value.length) {
    document.getElementById(fillInputId(nextIndex))?.focus();
    return;
  }
  void submitAnswer();
}

function handlePrimaryQuizAction() {
  if (needsManualConfirm.value) {
    void submitAnswer();
    return;
  }
  nextQuestion();
}

function optionClass(key: string) {
  const active = selectedAnswers.value.includes(key);
  if (!submitted.value || !currentQuestion.value) return { selected: active };
  const official = getOfficialAnswer(currentQuestion.value);
  return {
    selected: active,
    correct: official.includes(key),
    wrong: active && !official.includes(key)
  };
}

function createClientAnswerId(questionId: string) {
  const randomId = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `${questionId}:${randomId}`.slice(0, 120);
}

function setPracticeRecord(questionId: string, record: PracticeSessionRecord) {
  quizSessionRecords.value[questionId] = record;
  persistCurrentPracticeResume();
}

function applyAnswerResult(
  question: any,
  userAnswer: string[],
  result: { correct: boolean; answer: string[]; explanation: string },
  clientAnswerId: string,
  syncStatus: PracticeSessionRecord['syncStatus']
) {
  const normalizedAnswer = result.answer.map((item) => String(item));
  const explanationText = result.explanation || question.explanation || '';
  const record = {
    correct: result.correct,
    userAnswer: userAnswer.map((item) => String(item)),
    answer: normalizedAnswer,
    explanation: explanationText,
    clientAnswerId,
    syncStatus
  };

  setPracticeRecord(question.id, record);

  if (currentQuestion.value?.id === question.id) {
    selectedAnswers.value = question.type === 'fill' ? [] : [...record.userAnswer];
    textAnswer.value = question.type === 'fill' ? record.userAnswer[0] || '' : textAnswer.value;
    fillAnswers.value = question.type === 'fill' ? [...record.userAnswer] : [];
    answer.value = [...record.answer];
    explanation.value = record.explanation;
    submitted.value = true;
    lastResult.value = { correct: record.correct };
  }
}

function clearPendingAnswerRetryTimer() {
  if (!pendingAnswerRetryTimer) return;
  clearTimeout(pendingAnswerRetryTimer);
  pendingAnswerRetryTimer = null;
}

function schedulePendingAnswerRetry() {
  clearPendingAnswerRetryTimer();
  const userKey = pendingAnswerUserKey.value;
  if (!userKey) return;
  if (summarizePendingAnswerQueue(userKey).authFailed > 0) return;
  const delay = nextPendingRetryDelayMs(userKey);
  if (delay === null) return;
  pendingAnswerRetryTimer = setTimeout(() => {
    pendingAnswerRetryTimer = null;
    void syncPendingAnswers('timer');
  }, Math.min(Math.max(delay, 250), 60000));
}

function handlePendingAnswerOnline() {
  void syncPendingAnswers('online');
}

function clearCorrectAnswerAutoAdvanceTimer() {
  if (!correctAnswerAutoAdvanceTimer) return;
  clearTimeout(correctAnswerAutoAdvanceTimer);
  correctAnswerAutoAdvanceTimer = null;
}

function scheduleCorrectAnswerAutoAdvance(question: any) {
  clearCorrectAnswerAutoAdvanceTimer();
  if (!autoAdvanceOnCorrectFeature.value) return;
  if (!question || currentIndex.value >= questions.value.length - 1) return;

  const expectedQuestionId = String(question.id);
  const expectedIndex = currentIndex.value;
  correctAnswerAutoAdvanceTimer = setTimeout(() => {
    correctAnswerAutoAdvanceTimer = null;
    if (!autoAdvanceOnCorrectFeature.value) return;
    if (currentIndex.value !== expectedIndex) return;
    if (String(currentQuestion.value?.id || '') !== expectedQuestionId) return;
    if (!submitted.value || !lastResult.value?.correct) return;
    nextQuestion();
  }, CORRECT_ANSWER_AUTO_ADVANCE_MS);
}

function pendingAnswerErrorStatus(error: unknown) {
  return error instanceof ApiError ? error.status : 0;
}

function pendingAnswerErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return 'sync failed';
}

function markPracticeRecordSyncStatus(record: PendingAnswerRecord, syncStatus: PracticeSessionRecord['syncStatus']) {
  const practiceRecord = quizSessionRecords.value[record.questionId];
  if (practiceRecord?.clientAnswerId !== record.clientAnswerId) return;
  setPracticeRecord(record.questionId, { ...practiceRecord, syncStatus });
}

function applySyncedPendingAnswer(record: PendingAnswerRecord, data: { correct: boolean; answer: string[]; explanation: string }) {
  const question = questions.value.find((item) => String(item.id) === String(record.questionId));
  if (!question) {
    markPracticeRecordSyncStatus(record, 'synced');
    return;
  }
  applyAnswerResult(question, record.selectedAnswer, {
    correct: data.correct,
    answer: data.answer,
    explanation: data.explanation || question.explanation || ''
  }, record.clientAnswerId, 'synced');
}

function enqueueCurrentAnswer(question: any, userAnswer: string[], clientAnswerId: string, isCorrect: boolean, durationSeconds: number) {
  const userKey = pendingAnswerUserKey.value;
  if (!userKey) return;

  enqueuePendingAnswer(userKey, {
    clientAnswerId,
    questionId: String(question.id),
    selectedAnswer: userAnswer.map((item) => String(item)),
    isCorrect,
    answeredAt: new Date().toISOString(),
    retryCount: 0,
    lastTriedAt: '',
    status: 'pending',
    durationSeconds
  });
}

async function syncPendingAnswers(_reason: string, options: { resetAuthFailures?: boolean } = {}) {
  const userKey = pendingAnswerUserKey.value;
  if (!userKey) return;
  if (options.resetAuthFailures) resetAuthFailedPendingAnswers(userKey);
  if (pendingAnswerSyncRunning) {
    schedulePendingAnswerRetry();
    return;
  }

  const dueRecords = selectDuePendingAnswers(userKey).sort((left, right) => (
    Date.parse(left.answeredAt || '') - Date.parse(right.answeredAt || '')
  ));
  if (!dueRecords.length) {
    schedulePendingAnswerRetry();
    return;
  }

  pendingAnswerSyncRunning = true;
  clearPendingAnswerRetryTimer();

  try {
    for (const record of dueRecords) {
      if (pendingAnswerUserKey.value !== userKey) break;
      const tryingRecord = updatePendingAnswer(userKey, record.clientAnswerId, (current) => ({
        ...current,
        status: 'syncing',
        retryCount: current.retryCount + 1,
        lastTriedAt: new Date().toISOString(),
        lastError: undefined,
        lastStatusCode: undefined
      }));
      if (!tryingRecord) continue;

      try {
        const data = await api.post<{ correct: boolean; answer: string[]; explanation: string; recorded?: boolean }>('/practice/answers', {
          questionId: tryingRecord.questionId,
          selected: tryingRecord.selectedAnswer,
          clientAnswerId: tryingRecord.clientAnswerId,
          durationSeconds: tryingRecord.durationSeconds || 0
        });
        removePendingAnswer(userKey, tryingRecord.clientAnswerId);
        applySyncedPendingAnswer(tryingRecord, data);
        window.dispatchEvent(new Event('qanda:stats-updated'));
      } catch (error) {
        const status = pendingAnswerErrorStatus(error);
        const nextStatus: PendingAnswerRecord['status'] = status === 401 || status === 403
          ? 'auth_failed'
          : status === 400
            ? 'invalid'
            : 'failed';
        updatePendingAnswer(userKey, tryingRecord.clientAnswerId, {
          status: nextStatus,
          lastError: pendingAnswerErrorMessage(error),
          lastStatusCode: status || undefined
        });
        markPracticeRecordSyncStatus(tryingRecord, 'failed');
        if (nextStatus === 'auth_failed') break;
      }
    }
  } finally {
    pendingAnswerSyncRunning = false;
    schedulePendingAnswerRetry();
  }
}

function submitAnswer() {
  const question = currentQuestion.value;
  if (!question || submitted.value) return;
  const userAnswer = (question.type === 'fill' ? fillUserAnswerValues(question) : selectedAnswers.value).map((item) => String(item));
  const answeredValues = userAnswer.map((item) => String(item).trim());
  if (!answeredValues.some(Boolean) || (question.type === 'fill' && !answeredValues.every(Boolean))) {
    answerTip.value = '请选择或填写答案';
    return;
  }

  const officialAnswer = getOfficialAnswer(question);
  const answerForCheck = question.type === 'fill' ? fillAnswerGroupsForCheck(question) : officialAnswer;
  const clientAnswerId = createClientAnswerId(String(question.id));
  const durationSeconds = currentQuestionDurationSeconds();
  const correct = question.type === 'fill'
    ? isFillAnswerCorrect(userAnswer, answerForCheck)
    : isAnswerCorrect(userAnswer, officialAnswer);
  applyAnswerResult(question, userAnswer, {
    correct,
    answer: officialAnswer,
    explanation: question.explanation || ''
  }, clientAnswerId, 'pending');

  enqueueCurrentAnswer(question, userAnswer, clientAnswerId, correct, durationSeconds);
  if (correct && autoAdvanceOnCorrectFeature.value) scheduleCorrectAnswerAutoAdvance(question);
  else clearCorrectAnswerAutoAdvanceTimer();
  void syncPendingAnswers('new-answer');
}

function hasDismissedAutoAdvanceHint() {
  if (typeof window === 'undefined') return true;
  try {
    return window.localStorage.getItem(AUTO_ADVANCE_HINT_DISMISSED_KEY) === '1';
  } catch {
    return true;
  }
}

function maybeShowAutoAdvanceHint() {
  if (!questions.value.length) return;
  if (hasDismissedAutoAdvanceHint()) return;
  dontShowAutoAdvanceHint.value = false;
  showAutoAdvanceHintDialog.value = true;
}

function confirmAutoAdvanceHint() {
  if (!dontShowAutoAdvanceHint.value || typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(AUTO_ADVANCE_HINT_DISMISSED_KEY, '1');
  } catch {
    // localStorage may be unavailable; the hint can safely reappear next time.
  }
}

async function toggleFavorite() {
  const question = currentQuestion.value;
  if (!question) return;
  try {
    const data = await api.post<{ favorite: boolean }>(`/practice/favorites/${question.id}/toggle`);
    question.favorite = data.favorite;
    showToast(data.favorite ? '已收藏' : '已取消收藏');
  } catch (e) {
    showToast({ type: 'fail', message: e instanceof Error ? e.message : '收藏失败' });
  }
}

function prevQuestion() {
  clearCorrectAnswerAutoAdvanceTimer();
  if (canGoPrevious.value) currentIndex.value -= 1;
}

function nextQuestion() {
  clearCorrectAnswerAutoAdvanceTimer();
  if (currentIndex.value >= questions.value.length - 1) {
    finishQuiz({ clearResume: true });
    return;
  }
  currentIndex.value += 1;
}

function jumpToQuestion(index: number) {
  if (index < 0 || index >= questions.value.length) return;
  clearCorrectAnswerAutoAdvanceTimer();
  currentIndex.value = index;
  quizOverviewOpen.value = false;
}

function setScrollTop(element: Element | null | undefined) {
  if (!(element instanceof HTMLElement)) return;
  element.scrollTop = 0;
  element.scrollLeft = 0;
}

function resetQuestionScrollPosition() {
  const reset = () => {
    const main = quizMainRef.value;
    setScrollTop(main);
    setScrollTop(main?.closest('.qx-quiz-content'));
    setScrollTop(document.scrollingElement);
    document.body.scrollTop = 0;
    document.documentElement.scrollTop = 0;
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  };

  reset();
  void nextTick(() => {
    reset();
    if (questionScrollResetFrame !== undefined) window.cancelAnimationFrame(questionScrollResetFrame);
    questionScrollResetFrame = window.requestAnimationFrame(() => {
      questionScrollResetFrame = undefined;
      reset();
    });
  });
}

async function scrollCurrentOverviewQuestionIntoView() {
  await nextTick();
  const container = quizOverviewRef.value;
  const activeButton = container?.querySelector<HTMLElement>('.qx-overview-index-btn.active');
  if (!container || !activeButton) return;

  const containerRect = container.getBoundingClientRect();
  const activeRect = activeButton.getBoundingClientRect();
  const offset = activeRect.top - containerRect.top - ((container.clientHeight - activeRect.height) / 2);
  container.scrollTop = Math.max(0, container.scrollTop + offset);
}

function handleTouchStart(event: TouchEvent) {
  const touch = event.changedTouches[0];
  if (!touch) return;
  touchStartX.value = touch.clientX;
  touchStartY.value = touch.clientY;
  touchStartTime.value = Date.now();
  touchStartInHorizontalScroller.value = isHorizontalScrollGestureTarget(event.target);
}

function handleTouchEnd(event: TouchEvent) {
  const touch = event.changedTouches[0];
  if (!touch) return;
  const dx = touch.clientX - touchStartX.value;
  const dy = touch.clientY - touchStartY.value;
  const duration = Date.now() - touchStartTime.value;
  const isHorizontalSwipe = Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.25 && duration < 700;
  if (!isHorizontalSwipe) return;
  if (touchStartInHorizontalScroller.value) return;
  if (dx < 0) nextQuestion();
  else prevQuestion();
}

function isHorizontalScrollGestureTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) return false;
  const scrollTarget = target.closest('.qx-code-pre, .qx-code-card pre, .qx-math-block');
  if (!(scrollTarget instanceof HTMLElement)) return false;
  return scrollTarget.scrollWidth > scrollTarget.clientWidth + 1;
}

async function finishQuiz(options: { clearResume?: boolean } = {}) {
  clearCorrectAnswerAutoAdvanceTimer();
  if (unansweredQuestionCount.value > 0) {
    try {
      await showConfirmDialog({
        title: '确认提交练习？',
        message: `还有 ${unansweredQuestionCount.value} 道题未作答，确认提交并结束练习吗？`,
        confirmButtonText: '确认提交',
        cancelButtonText: '继续答题'
      });
    } catch {
      return;
    }
  }

  if (options.clearResume) await clearCurrentPracticeResume();

  const returnRoute = practiceReturnRoute.value;
  if (returnRoute) {
    router.push(returnRoute);
    return;
  }
  if (bank.value?.subjectId) {
    router.push({ name: 'library', query: { subjectId: bank.value.subjectId } });
    return;
  }
  router.push('/');
}

function toggleQuizOverview() {
  if (!showQuestionOverviewFeature.value) return;
  quizOverviewOpen.value = !quizOverviewOpen.value;
  if (quizOverviewOpen.value) void scrollCurrentOverviewQuestionIntoView();
}
</script>
