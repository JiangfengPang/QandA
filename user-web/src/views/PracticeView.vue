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
                <button class="qx-quiz-pill-btn solid" :disabled="sessionSubmitting" @click="finishQuiz()">
                  {{ sessionSubmitting ? '提交中...' : '结束练习' }}
                </button>
                <button v-if="showQuestionOverviewFeature" class="qx-quiz-pill-btn" @click="toggleQuizOverview">答题卡</button>
              </div>
            </div>
          </div>
        </div>

        <div class="qx-practice-mobile-header" aria-label="移动端答题顶部栏">
          <div class="qx-mobile-nav-row">
            <button class="qx-mobile-back-btn" type="button" aria-label="返回题库" :disabled="sessionSubmitting" @click="finishQuiz()">
              <QxIcon name="chevron-left" />
            </button>
            <h1 class="qx-mobile-quiz-title">{{ mobileQuizTitle }}</h1>
            <span class="qx-mobile-nav-spacer" aria-hidden="true"></span>
          </div>

          <div class="qx-mobile-progress-row">
            <span class="qx-mobile-question-count"><strong>{{ currentProgressNumber }}</strong>/{{ totalProgressCount }}</span>
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
        <div class="qx-quiz-content" :class="{ 'is-reading-content': isReadingQuestion }">
          <div ref="quizMainRef" class="qx-quiz-main" @touchstart.passive="handleTouchStart" @touchend.passive="handleTouchEnd">
            <article
              class="qx-question-card"
              :class="[questionFontClass, { 'is-multiple-question': isMultipleQuestion, 'is-reading-question': isReadingQuestion }]"
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
                      :class="{ active: currentQuestion.favorite, 'is-submitting': currentFavoriteSubmitting }"
                      type="button"
                      :disabled="currentFavoriteSubmitting"
                      :aria-busy="currentFavoriteSubmitting ? 'true' : 'false'"
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
                  <span class="qx-question-inline-count">{{ currentProgressNumber }}/{{ totalProgressCount }}、</span>
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

            <div
              v-else-if="isReadingQuestion"
              class="qx-reading-layout"
              :class="{ 'is-sheet-collapsed': !readingSheetExpanded, 'is-sheet-expanded': readingSheetExpanded }"
            >
              <section class="qx-reading-passage" aria-label="阅读理解原文">
                <div class="qx-reading-passage-kicker">阅读原文</div>
                <PythonMarkdown
                  v-if="readingPassageText"
                  class="qx-reading-passage-text qx-reading-passage-markdown"
                  :markdown="readingPassageText"
                />
                <div v-else class="qx-reading-passage-empty">本题暂未录入阅读原文。</div>
              </section>

              <section
                class="qx-reading-sheet"
                :class="{ 'is-collapsed': !readingSheetExpanded, 'is-submitted': submitted }"
                :style="readingSheetStyle"
                aria-label="阅读理解小题"
              >
                <button
                  class="qx-reading-sheet-handle"
                  type="button"
                  :aria-expanded="readingSheetExpanded"
                  :aria-label="readingSheetExpanded ? '收起阅读理解小题' : '展开阅读理解小题'"
                  @pointerdown.stop="handleReadingSheetPointerDown"
                  @click.stop="toggleReadingSheet"
                >
                  <span aria-hidden="true"></span>
                  <strong class="qx-reading-float-label">小题</strong>
                </button>
                <div class="qx-reading-sheet-body" v-show="readingSheetExpanded">
                  <div class="qx-reading-question-head">
                    <span>小题</span>
                    <strong>{{ readingSubQuestionProgress.current }}/{{ readingSubQuestionProgress.total }}</strong>
                  </div>
                  <h3 class="qx-reading-question-title">{{ readingQuestionText }}</h3>

                  <div class="option-list qx-option-list qx-reading-option-list">
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

                  <div class="qx-reading-desktop-actions">
                    <button class="qx-action-btn ghost" :disabled="!canGoPrevious" @click="prevQuestion">← 上一题</button>
                    <button
                      class="qx-action-btn primary"
                      :disabled="primaryActionDisabled"
                      @click="handlePrimaryQuizAction"
                    >
                      {{ primaryActionDisplayText }}
                    </button>
                  </div>

                  <div v-if="submitted" class="result-box qx-result-box qx-reading-result-box" :class="{ correct: lastResult && lastResult.correct }">
                    <div class="qx-result-answer-row">
                      <span class="qx-answer-with-speech">
                        <span class="qx-result-answer-label">正确答案</span>
                        <span class="qx-result-answer-parts">
                          <template v-for="(part, index) in currentOfficialAnswerParts" :key="part.key">
                            <span class="qx-result-answer-part">
                              <b class="qx-result-answer-correct">{{ part.prefix }}{{ part.value }}</b>
                              <SpeakButton
                                v-for="item in part.speechItems"
                                :key="item.key"
                                :text="item.text"
                                :lang="item.lang"
                                :label="item.label"
                                :explicit="item.explicit"
                              />
                            </span>
                            <span v-if="index < currentOfficialAnswerParts.length - 1" class="qx-result-answer-separator">；</span>
                          </template>
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
              </section>
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

            <div v-if="submitted && !isPythonQuestion && !isReadingQuestion && isCompactPracticeViewport" class="result-box qx-result-box" :class="{ correct: lastResult && lastResult.correct }">
              <div class="qx-result-answer-row">
                <span class="qx-answer-with-speech">
                  <span class="qx-result-answer-label">正确答案</span>
                  <span class="qx-result-answer-parts">
                    <template v-for="(part, index) in currentOfficialAnswerParts" :key="part.key">
                      <span class="qx-result-answer-part">
                        <b class="qx-result-answer-correct">{{ part.prefix }}{{ part.value }}</b>
                        <SpeakButton
                          v-for="item in part.speechItems"
                          :key="item.key"
                          :text="item.text"
                          :lang="item.lang"
                          :label="item.label"
                          :explicit="item.explicit"
                        />
                      </span>
                      <span v-if="index < currentOfficialAnswerParts.length - 1" class="qx-result-answer-separator">；</span>
                    </template>
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
              :class="{ active: currentQuestion.favorite, 'is-submitting': currentFavoriteSubmitting }"
              type="button"
              :disabled="currentFavoriteSubmitting"
              :aria-busy="currentFavoriteSubmitting ? 'true' : 'false'"
              :aria-label="currentQuestion.favorite ? '取消收藏本题' : '收藏本题'"
              @click="toggleFavorite"
            >
              <QxIcon class="qx-favorite-icon" name="star" :tone="currentQuestion.favorite ? 'gold' : 'slate'" />
              <span>{{ currentQuestion.favorite ? '已收藏' : '收藏此题' }}</span>
            </button>
          </div>

          <div v-if="submitted && !isPythonQuestion && !isReadingQuestion && !isCompactPracticeViewport" class="result-box qx-result-box" :class="{ correct: lastResult && lastResult.correct }">
            <div class="qx-result-answer-row">
              <span class="qx-answer-with-speech">
                <span class="qx-result-answer-label">正确答案</span>
                <span class="qx-result-answer-parts">
                  <template v-for="(part, index) in currentOfficialAnswerParts" :key="part.key">
                    <span class="qx-result-answer-part">
                      <b class="qx-result-answer-correct">{{ part.prefix }}{{ part.value }}</b>
                      <SpeakButton
                        v-for="item in part.speechItems"
                        :key="item.key"
                        :text="item.text"
                        :lang="item.lang"
                        :label="item.label"
                        :explicit="item.explicit"
                      />
                    </span>
                    <span v-if="index < currentOfficialAnswerParts.length - 1" class="qx-result-answer-separator">；</span>
                  </template>
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
              <p>{{ currentProgressNumber }}/{{ totalProgressCount }} 题</p>
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
                <template v-if="isReadingOverviewTypeGroup(typeGroup)">
                  <section
                    v-for="readingGroup in readingOverviewPassageGroups(typeGroup.items)"
                    :key="readingGroup.key"
                    class="qx-overview-reading-card"
                  >
                    <div class="qx-overview-reading-stem">
                      <strong>{{ readingGroup.title }}</strong>
                    </div>
                    <div class="question-index-grid qx-question-index-grid qx-reading-question-index-grid">
                      <button
                        v-for="item in readingGroup.items"
                        :key="item.index"
                        class="qx-overview-index-btn"
                        :class="overviewItemClass(item)"
                        :aria-label="overviewItemLabel(item)"
                        @click="jumpToQuestion(item.targetIndex ?? item.index)"
                      >
                        <span class="qx-overview-number">{{ item.number }}</span>
                        <span v-if="item.favorite" class="qx-overview-favorite-mark" aria-hidden="true">
                          <QxIcon name="star" tone="gold" />
                        </span>
                      </button>
                    </div>
                  </section>
                </template>
                <div v-else class="question-index-grid qx-question-index-grid">
                  <button
                    v-for="item in typeGroup.items"
                    :key="item.index"
                    class="qx-overview-index-btn"
                    :class="overviewItemClass(item)"
                    :aria-label="overviewItemLabel(item)"
                    @click="jumpToQuestion(item.targetIndex ?? item.index)"
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
      v-model:show="showPracticeResumeChoiceDialog"
      class-name="qx-resume-choice-dialog"
      title="继续上次练习？"
      :show-confirm-button="false"
      :close-on-click-overlay="false"
    >
      <div class="qx-resume-choice">
        <p>
          检测到你上次练到第
          <strong>{{ practiceResumeChoiceQuestionNumber }}</strong>
          题<span v-if="practiceResumeChoiceTotal">，共 {{ practiceResumeChoiceTotal }} 题</span>。
        </p>
        <div class="qx-resume-choice-actions">
          <button class="qx-resume-choice-btn primary" type="button" @click="choosePracticeResumeRestore('continue')">继续练习</button>
          <button class="qx-resume-choice-btn danger" type="button" @click="choosePracticeResumeRestore('clear')">清除进度</button>
        </div>
      </div>
    </van-dialog>

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
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router';
import { showConfirmDialog, showToast } from 'vant';
import { ApiError, api } from '../api/request';
import QxIcon from '../components/QxIcon.vue';
import SpeakButton from '../components/SpeakButton.vue';
import { useAuthStore } from '../stores/auth';
import { useVisualViewportHeight } from '../composables/useVisualViewportHeight';
import { isAnswerCorrect, isFillAnswerCorrect, normalizeAnswer } from '../utils/answer';
import { judgeAnswerKey, judgeOptionDisplay, normalizeOptions, optionKeyDisplay, questionTypeText } from '../utils/question';
import {
  canGoToPreviousQuestion,
  getQuestionDisplayGroups,
  getQuestionDisplayProgress,
  getQuestionDisplayProgressPercent,
  getReadingSubQuestionProgress,
  getUnitQueueProgress,
} from '../utils/practiceProgress';
import { buildPracticeOverviewGroups, buildReadingOverviewPassageGroups, isReadingOverviewItem } from '../utils/practiceOverview';
import { canAutoAdvanceAfterCorrectAnswer, needsManualAnswerConfirm, shouldSubmitChoiceImmediately } from '../utils/practiceInteraction';
import { speechItemsForQuestion, type SpeechItem } from '../utils/pronunciation';
import {
  applyPracticeResumeSnapshotQuestionOrder,
  applySavedPracticeQuestionOrder,
  buildPracticeResumeKey,
  clearPracticeResume,
  isPracticeResumeSnapshotComplete,
  newerPracticeResume,
  practiceResumeSessionRecordsFromSnapshot,
  practiceResumeUpdatedAt,
  readPracticeResume,
  resolvePracticeResumeRestoreIndex,
  savePracticeResume,
  shouldAskToRestorePracticeResume,
  shouldClearPracticeResumeOnExit,
  shouldSavePracticeResumeSnapshot,
  writePracticeResumeSnapshot
} from '../utils/practiceResume';
import {
  clearRemotePracticeResume,
  createRemotePracticeResumeSaveController,
  fetchRemotePracticeResume,
} from '../utils/practiceResumeRemote';
import {
  dedupePendingAnswerRecords,
  enqueuePendingAnswer,
  nextPendingRetryDelayMs,
  removePendingAnswer,
  removePendingAnswersByClientAnswerIds,
  resetAuthFailedPendingAnswers,
  selectDuePendingAnswers,
  selectPendingAnswersByPracticeSession,
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

type AnswerSpeechPart = {
  key: string;
  prefix: string;
  value: string;
  speechItems: SpeechItem[];
};

type PendingAnswerSyncResult = {
  clientAnswerId?: string;
  correct: boolean;
  answer: string[];
  explanation: string;
  recorded?: boolean;
  queued?: boolean;
};

type PendingAnswerBatchResponse = {
  practiceSessionId?: string;
  clientSubmissionId?: string;
  accepted: number;
  queued?: number;
  submissionStatus?: string;
  results: PendingAnswerSyncResult[];
};

type PendingAnswerSyncStatus = PendingAnswerRecord['status'] | 'synced';
type PracticeResumeRestoreChoice = 'continue' | 'clear';

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
const readingSheetExpanded = ref(true);
const readingFloatPosition = ref({ x: 32, y: 220 });
const readingFloatJustDragged = ref(false);
const showPracticeResumeChoiceDialog = ref(false);
const practiceResumeChoiceQuestionNumber = ref(1);
const practiceResumeChoiceTotal = ref(0);
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
const practiceSessionId = ref('');
const sessionSubmitting = ref(false);
const sessionSubmitted = ref(false);
const favoriteSubmittingByQuestionId = ref<Record<string, boolean>>({});
const MAX_RECORDED_ANSWER_SECONDS = 30 * 60;
const CORRECT_ANSWER_AUTO_ADVANCE_MS = 160;
const PENDING_ANSWER_SYNC_BATCH_SIZE = 20;
const NEW_ANSWER_SYNC_DELAY_MS = 1500;
const NEW_ANSWER_SYNC_JITTER_MS = 3000;
const AUTO_ADVANCE_HINT_DISMISSED_KEY = 'qanda_auto_advance_hint_dismissed';
const questionVisibleStartedAt = ref(Date.now());
const questionActiveElapsedMs = ref(0);
let practiceViewportMediaQuery: MediaQueryList | null = null;
let pendingAnswerSyncRunning = false;
let pendingAnswerRetryTimer: ReturnType<typeof setTimeout> | null = null;
let correctAnswerAutoAdvanceTimer: ReturnType<typeof setTimeout> | null = null;
let pendingPracticeResumeChoiceResolve: ((choice: PracticeResumeRestoreChoice) => void) | null = null;
let questionScrollResetFrame: number | undefined;
let practiceResumeReady = false;
const answerSubmitLocks = new Set<string>();
let readingFloatDragState: {
  active: boolean;
  pointerId: number;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
  moved: boolean;
} | null = null;

const currentQuestion = computed(() => questions.value[currentIndex.value] || null);
const currentFavoriteSubmitting = computed(() => {
  const questionId = String(currentQuestion.value?.id || '');
  return questionId ? Boolean(favoriteSubmittingByQuestionId.value[questionId]) : false;
});
const currentOptions = computed(() => normalizeOptions(currentQuestion.value?.options || []));
const isMultipleQuestion = computed(() => currentQuestion.value?.type === 'multiple');
const currentQuestionTypeBadge = computed(() => {
  const label = questionTypeText(currentQuestion.value);
  if (label.endsWith('题') || label === '题目') return label;
  return `${label}题`;
});
const isFillQuestion = computed(() => currentQuestion.value?.type === 'fill');
const isPythonQuestion = computed(() => currentQuestion.value?.type === 'python');
const isReadingQuestion = computed(() => currentQuestion.value?.type === 'reading');
const questionStemText = computed(() => String(currentQuestion.value?.question || currentQuestion.value?.stem || '').trim());
const readingPassageText = computed(() => String(currentQuestion.value?.readingPassage || '').trim());
const readingQuestionText = computed(() => String(currentQuestion.value?.readingQuestion || '').trim());
const readingSheetStyle = computed(() => {
  if (!isReadingQuestion.value || readingSheetExpanded.value || isCompactPracticeViewport.value) return {};
  return {
    transform: `translate3d(${readingFloatPosition.value.x}px, ${readingFloatPosition.value.y}px, 0)`
  };
});
const currentFillBlanks = computed(() => fillBlankDefinitions(currentQuestion.value));
const isMultiFillQuestion = computed(() => currentFillBlanks.value.length > 1);
const pythonAnswerMarkdown = computed(() => {
  const raw = Array.isArray(currentQuestion.value?.answer) ? currentQuestion.value.answer[0] : '';
  return String(raw || currentQuestion.value?.pythonAnswer || '').trim();
});
const needsManualConfirm = computed(() => needsManualAnswerConfirm(currentQuestion.value?.type, submitted.value));
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
const displayProgress = computed(() => getQuestionDisplayProgress(questions.value, currentIndex.value));
const currentProgressNumber = computed(() => displayProgress.value.current);
const totalProgressCount = computed(() => displayProgress.value.total);
const progress = computed(() => getQuestionDisplayProgressPercent(questions.value, currentIndex.value));
const readingSubQuestionProgress = computed(() => getReadingSubQuestionProgress(questions.value, currentIndex.value));
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
const currentOfficialAnswerParts = computed(() => officialAnswerSpeechParts(currentQuestion.value, currentOfficialAnswerSummary.value, currentAnswerSpeechItems.value));
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

const remotePracticeResumeSaver = createRemotePracticeResumeSaveController({
  read: () => {
    const key = practiceResumeKey.value;
    const snapshot = readPracticeResume(key);
    return key && snapshot ? { key, snapshot } : null;
  },
  onSaved: (sent, savedSnapshot) => {
    const currentSnapshot = readPracticeResume(sent.key);
    if (savedSnapshot && practiceResumeUpdatedAt(currentSnapshot) <= practiceResumeUpdatedAt(sent.snapshot)) {
      writePracticeResumeSnapshot(sent.key, savedSnapshot);
    }
  }
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
  return getQuestionDisplayGroups(questions.value).map((group) => {
    const subItems = group.indices.map((questionIndex, subIndex) => (
      buildOverviewQuestionItem(questions.value[questionIndex], questionIndex, subIndex + 1)
    ));
    const groupStatus = overviewGroupStatus(subItems);
    return {
      index: group.firstIndex,
      targetIndex: group.firstIndex,
      indices: [...group.indices],
      number: group.number,
      question: group.question,
      answered: subItems.every((item) => item.answered),
      correct: groupStatus === 'correct' ? true : groupStatus === 'wrong' ? false : undefined,
      status: groupStatus,
      favorite: subItems.some((item) => item.favorite),
      subItems
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
  if (!isSubjectPractice.value) return `第 ${currentProgressNumber.value} / ${totalProgressCount.value} 题`;

  const unitProgress = currentUnitProgress.value;
  if (!unitProgress) return `总进度 ${currentProgressNumber.value} / ${totalProgressCount.value}`;

  return `本单元第 ${unitProgress.current} / ${unitProgress.total} 题 · 总进度 ${currentProgressNumber.value} / ${totalProgressCount.value}`;
});

function overviewItemClass(item: any) {
  return {
    active: Array.isArray(item.indices) ? item.indices.includes(currentIndex.value) : currentIndex.value === item.index,
    unanswered: item.status === 'unanswered',
    answered: item.status === 'answered',
    correct: item.status === 'correct',
    wrong: item.status === 'wrong',
    favorite: item.favorite
  };
}

function isReadingOverviewTypeGroup(typeGroup: any) {
  return Array.isArray(typeGroup?.items) && typeGroup.items.length > 0 && typeGroup.items.every((item: any) => isReadingOverviewItem(item));
}

function readingOverviewPassageGroups(items: any[]) {
  return buildReadingOverviewPassageGroups(items);
}

function overviewQuestionStatus(question: any) {
  const record = quizSessionRecords.value[question?.id];
  const answered = question?.type === 'python' || Boolean(record);
  const status = !answered
    ? 'unanswered'
    : record?.correct === true
      ? 'correct'
      : record?.correct === false
        ? 'wrong'
        : 'answered';

  return {
    answered,
    correct: status === 'correct' ? true : status === 'wrong' ? false : undefined,
    status
  };
}

function buildOverviewQuestionItem(question: any, index: number, number: number) {
  const status = overviewQuestionStatus(question);
  return {
    index,
    targetIndex: index,
    indices: [index],
    number,
    question,
    ...status,
    favorite: Boolean(question?.favorite)
  };
}

function overviewGroupStatus(items: Array<{ answered?: boolean; status?: string }>) {
  if (!items.length || items.every((item) => !item.answered)) return 'unanswered';
  if (items.every((item) => item.status === 'correct')) return 'correct';
  if (items.some((item) => item.status === 'wrong')) return 'wrong';
  return 'answered';
}

function overviewItemLabel(item: any) {
  const statusText = ({
    unanswered: '未答',
    answered: '已答',
    correct: '答对',
    wrong: '答错'
  } as Record<string, string>)[item.status] || '未答';
  const isCurrent = Array.isArray(item.indices) ? item.indices.includes(currentIndex.value) : currentIndex.value === item.index;
  const currentText = isCurrent ? '，当前题' : '';
  const favoriteText = item.favorite ? '，已收藏' : '';
  const unitText = isSubjectPractice.value && (item.question?.unitName || item.question?.bankName) ? `${item.question.unitName || item.question.bankName}，` : '';
  const ordinalText = isReadingOverviewItem(item) ? `第 ${item.number} 小题` : `第 ${item.number} 题`;
  return `${unitText}${questionTypeText(item.question)}，${ordinalText}，${statusText}${currentText}${favoriteText}`;
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

function clampReadingFloatPosition(x: number, y: number) {
  if (typeof window === 'undefined') return { x, y };
  const maxX = Math.max(window.innerWidth - 170, 12);
  const maxY = Math.max(window.innerHeight - 78, 88);
  return {
    x: Math.min(Math.max(x, 12), maxX),
    y: Math.min(Math.max(y, 88), maxY)
  };
}

function ensureReadingFloatPosition() {
  if (typeof window === 'undefined') return;
  const current = readingFloatPosition.value;
  const untouched = current.x === 32 && current.y === 220;
  const next = untouched
    ? {
        x: Math.max(24, Math.min(window.innerWidth - 190, 42)),
        y: Math.max(120, Math.min(window.innerHeight - 110, Math.round(window.innerHeight * 0.42)))
      }
    : current;
  readingFloatPosition.value = clampReadingFloatPosition(next.x, next.y);
}

function toggleReadingSheet() {
  if (readingFloatJustDragged.value) {
    readingFloatJustDragged.value = false;
    return;
  }
  readingSheetExpanded.value = !readingSheetExpanded.value;
  if (!readingSheetExpanded.value) ensureReadingFloatPosition();
}

function handleReadingSheetPointerDown(event: PointerEvent) {
  if (readingSheetExpanded.value || isCompactPracticeViewport.value) return;
  const target = event.currentTarget;
  if (!(target instanceof HTMLElement)) return;
  readingFloatDragState = {
    active: true,
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    originX: readingFloatPosition.value.x,
    originY: readingFloatPosition.value.y,
    moved: false
  };
  target.setPointerCapture?.(event.pointerId);
  window.addEventListener('pointermove', handleReadingFloatPointerMove);
  window.addEventListener('pointerup', finishReadingFloatDrag);
  window.addEventListener('pointercancel', finishReadingFloatDrag);
}

function handleReadingFloatPointerMove(event: PointerEvent) {
  const state = readingFloatDragState;
  if (!state?.active || event.pointerId !== state.pointerId) return;
  const dx = event.clientX - state.startX;
  const dy = event.clientY - state.startY;
  if (Math.abs(dx) + Math.abs(dy) > 5) state.moved = true;
  readingFloatPosition.value = clampReadingFloatPosition(state.originX + dx, state.originY + dy);
}

function removeReadingFloatDragListeners() {
  if (typeof window === 'undefined') return;
  window.removeEventListener('pointermove', handleReadingFloatPointerMove);
  window.removeEventListener('pointerup', finishReadingFloatDrag);
  window.removeEventListener('pointercancel', finishReadingFloatDrag);
}

function finishReadingFloatDrag(event?: PointerEvent) {
  const state = readingFloatDragState;
  if (state?.moved && (!event || event.pointerId === state.pointerId)) {
    readingFloatJustDragged.value = true;
    window.setTimeout(() => {
      readingFloatJustDragged.value = false;
    }, 0);
  }
  readingFloatDragState = null;
  removeReadingFloatDragListeners();
}

useVisualViewportHeight();

onMounted(async () => {
  setupPracticeViewportQuery();
  document.addEventListener('visibilitychange', handleVisibilityChange);
  if (typeof window !== 'undefined') {
    window.addEventListener('pagehide', handlePracticePageHide);
    window.addEventListener('beforeunload', handlePracticeBeforeUnload);
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
  }
});

onBeforeUnmount(() => {
  document.removeEventListener('visibilitychange', handleVisibilityChange);
  if (typeof window !== 'undefined') {
    window.removeEventListener('pagehide', handlePracticePageHide);
    window.removeEventListener('beforeunload', handlePracticeBeforeUnload);
  }
  if (typeof window !== 'undefined' && questionScrollResetFrame !== undefined) {
    window.cancelAnimationFrame(questionScrollResetFrame);
  }
  clearCorrectAnswerAutoAdvanceTimer();
  clearPendingAnswerRetryTimer();
  resolvePendingPracticeResumeChoice('continue');
  removeReadingFloatDragListeners();
  flushRemotePracticeResumeSync();
  teardownPracticeViewportQuery();
});

onBeforeRouteLeave(async (_to, _from, next) => {
  if (!hasUnsubmittedCurrentPracticeSession()) {
    next();
    return;
  }

  try {
    await showConfirmDialog({
      title: '当前有未提交的答题记录',
      message: '是否结束答题并提交？',
      confirmButtonText: '提交并离开',
      cancelButtonText: '继续答题'
    });
    const submittedOk = await submitCurrentPracticeSession();
    if (submittedOk) next();
    else next(false);
  } catch {
    try {
      await showConfirmDialog({
        title: '仅保存本地？',
        message: '答案会保存在本机，稍后回到本练习再提交。',
        confirmButtonText: '仅保存本地，稍后提交',
        cancelButtonText: '继续答题'
      });
      persistCurrentPracticeResume();
      next();
    } catch {
      next(false);
    }
  }
});

watch(() => currentQuestion.value?.id, () => {
  clearCorrectAnswerAutoAdvanceTimer();
  readingSheetExpanded.value = true;
  readingFloatJustDragged.value = false;
  restoreQuestionState();
  resetQuestionTimer();
  resetQuestionScrollPosition();
}, { immediate: true });

watch(() => [currentIndex.value, currentQuestion.value?.id, questions.value.length, practiceResumeKey.value], () => {
  persistCurrentPracticeResume();
});

watch(() => pendingAnswerUserKey.value, () => {
  const userKey = pendingAnswerUserKey.value;
  if (userKey) resetAuthFailedPendingAnswers(userKey);
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
    void flushRemotePracticeResumeSync({ keepalive: true });
  } else {
    resumeQuestionTimer();
  }
}

function handlePracticePageHide() {
  pauseQuestionTimer();
  flushRemotePracticeResumeSync({ keepalive: true });
}

function handlePracticeBeforeUnload() {
  pauseQuestionTimer();
  persistCurrentPracticeResume();
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

function isAutoAnsweredPracticeQuestion(question: any) {
  return question?.type === 'python';
}

async function requestPracticeResumeRestoreChoice(savedIndex: number) {
  practiceResumeChoiceQuestionNumber.value = Math.max(1, savedIndex + 1);
  practiceResumeChoiceTotal.value = questions.value.length;
  showPracticeResumeChoiceDialog.value = true;
  loading.value = false;
  await nextTick();
  return new Promise<PracticeResumeRestoreChoice>((resolve) => {
    pendingPracticeResumeChoiceResolve = resolve;
  });
}

function choosePracticeResumeRestore(choice: PracticeResumeRestoreChoice) {
  resolvePendingPracticeResumeChoice(choice);
}

function resolvePendingPracticeResumeChoice(choice: PracticeResumeRestoreChoice) {
  const resolve = pendingPracticeResumeChoiceResolve;
  pendingPracticeResumeChoiceResolve = null;
  showPracticeResumeChoiceDialog.value = false;
  if (resolve) resolve(choice);
}

async function restoreSavedPracticeResume() {
  const key = practiceResumeKey.value;
  if (!key) {
    ensurePracticeSessionId();
    practiceResumeReady = true;
    restoreQuestionState();
    return;
  }

  const localSnapshot = readPracticeResume(key);
  const remoteSnapshot = await loadRemotePracticeResumeSnapshot(key);
  const selectedSnapshot = newerPracticeResume(localSnapshot, remoteSnapshot);
  practiceSessionId.value = selectedSnapshot?.practiceSessionId || practiceSessionId.value || createPracticeSessionId();
  sessionSubmitted.value = Boolean(selectedSnapshot?.submitted);

  if (selectedSnapshot) {
    writePracticeResumeSnapshot(key, selectedSnapshot);
    const orderedQuestions = applyPracticeResumeSnapshotQuestionOrder(selectedSnapshot, questions.value);
    if (orderedQuestions) questions.value = orderedQuestions;
  }

  quizSessionRecords.value = practiceResumeSessionRecordsFromSnapshot(selectedSnapshot, questions.value);

  if (selectedSnapshot && isPracticeResumeSnapshotComplete(selectedSnapshot, questions.value, isAutoAnsweredPracticeQuestion)) {
    quizSessionRecords.value = {};
    currentIndex.value = 0;
    practiceResumeReady = true;
    restoreQuestionState();
    await clearCurrentPracticeResume();
    return;
  }

  const savedIndex = resolvePracticeResumeRestoreIndex(selectedSnapshot, questions.value, isAutoAnsweredPracticeQuestion);
  let shouldPersistAfterRestore = true;

  if (shouldAskToRestorePracticeResume(selectedSnapshot, questions.value, savedIndex)) {
    const choice = await requestPracticeResumeRestoreChoice(savedIndex || 0);
    if (choice === 'continue') {
      if (savedIndex !== null) currentIndex.value = savedIndex;
      enqueueResumedPendingAnswers();
    } else {
      currentIndex.value = 0;
      await clearCurrentPracticeResume();
      quizSessionRecords.value = {};
      shouldPersistAfterRestore = false;
      showToast('已清除上次进度');
    }
  } else if (savedIndex !== null) {
    currentIndex.value = savedIndex;
    enqueueResumedPendingAnswers();
  }

  practiceResumeReady = true;
  restoreQuestionState();
  ensurePracticeSessionId();
  if (shouldPersistAfterRestore) persistCurrentPracticeResume();
}

function persistCurrentPracticeResume() {
  if (!practiceResumeReady) return;
  if (!shouldSavePracticeResumeSnapshot(currentIndex.value, quizSessionRecords.value)) return;
  const snapshot = savePracticeResume(practiceResumeKey.value, questions.value, currentIndex.value, quizSessionRecords.value, {
    practiceSessionId: ensurePracticeSessionId(),
    scope: practiceSessionScope(),
    submitted: sessionSubmitted.value
  });
  if (snapshot) scheduleRemotePracticeResumeSync();
}

async function clearCurrentPracticeResume() {
  const key = practiceResumeKey.value;
  remotePracticeResumeSaver.cancel();
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

function scheduleRemotePracticeResumeSync() {
  if (!practiceResumeReady || !practiceResumeKey.value) return;
  remotePracticeResumeSaver.schedule();
}

function flushRemotePracticeResumeSync(options: { keepalive?: boolean } = {}) {
  return remotePracticeResumeSaver.flush(options.keepalive ? { keepalive: true } : {});
}

function enqueueResumedPendingAnswers() {
  const userKey = pendingAnswerUserKey.value;
  if (!userKey) return;

  Object.entries(quizSessionRecords.value).forEach(([questionId, record]) => {
    if (!record.clientAnswerId || record.syncStatus === 'synced') return;
    enqueuePendingAnswer(userKey, {
      clientAnswerId: record.clientAnswerId,
      questionId,
      practiceSessionId: ensurePracticeSessionId(),
      sessionKey: practiceResumeKey.value || undefined,
      questionIndex: questions.value.findIndex((question) => String(question.id) === questionId),
      scope: practiceSessionScope(),
      selectedAnswer: record.userAnswer,
      isCorrect: record.correct,
      answer: record.answer,
      explanation: record.explanation,
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
  const values = source.map((item: unknown) => String(item));
  if (!question || question.type === 'fill' || question.type === 'python') return values;
  return normalizeAnswer(values);
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

function officialAnswerSpeechParts(question: any, fallbackText: string, speechItems: SpeechItem[]): AnswerSpeechPart[] {
  if (question?.type === 'fill') {
    const blanks = fillBlankDefinitions(question);
    if (blanks.length > 1) {
      const official = fillOfficialAnswerValues(question);
      return blanks.map((blank: FillBlankDefinition, index: number) => {
        const label = fillBlankLabel(blank, index);
        const matchedSpeech = speechItems.find((item) => item.key === blank.id || item.label === label)
          || (speechItems.length === blanks.length ? speechItems[index] : null);
        return {
          key: blank.id || `blank-${index + 1}`,
          prefix: `${label}：`,
          value: String(official[index] || '-').trim() || '-',
          speechItems: matchedSpeech ? [matchedSpeech] : []
        };
      });
    }
  }

  return [{
    key: 'answer',
    prefix: '',
    value: fallbackText || '-',
    speechItems
  }];
}

function restoreQuestionState() {
  const question = currentQuestion.value;
  answerTip.value = '';
  explanationRevealed.value = false;
  if (!question) {
    answerSubmitLocks.clear();
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
    answerSubmitLocks.delete(String(question.id));
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

  if (shouldSubmitChoiceImmediately(currentQuestion.value.type)) {
    recordCurrentChoice(key);
    return;
  }

  if (currentQuestion.value.type === 'multiple') {
    selectedAnswers.value = selectedAnswers.value.includes(key)
      ? selectedAnswers.value.filter((item) => item !== key)
      : [...selectedAnswers.value, key];
    return;
  }

  recordCurrentChoice(key);
}

function recordCurrentChoice(key: string) {
  selectedAnswers.value = [key];
  submitAnswer();
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

function createPracticeSessionId() {
  const randomId = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `ps:${randomId}`.slice(0, 191);
}

function ensurePracticeSessionId() {
  if (!practiceSessionId.value) practiceSessionId.value = createPracticeSessionId();
  return practiceSessionId.value;
}

function practiceSessionScope() {
  if (reviewPracticeMode.value) return `review:${reviewPracticeMode.value}:${reviewPracticeSubjectId.value || 'all'}`;
  if (isSubjectPractice.value) return `subject:${route.query.subjectId || route.params.bankId || ''}:${practiceOrder.value || 'sequence'}`;
  return `bank:${route.params.bankId || ''}`;
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

function nextNewAnswerSyncDelayMs() {
  return NEW_ANSWER_SYNC_DELAY_MS + Math.floor(Math.random() * NEW_ANSWER_SYNC_JITTER_MS);
}

function schedulePendingAnswerRetry(options: { minDelayMs?: number } = {}) {
  clearPendingAnswerRetryTimer();
  const userKey = pendingAnswerUserKey.value;
  if (!userKey) return;
  if (summarizePendingAnswerQueue(userKey).authFailed > 0) return;
  const delay = nextPendingRetryDelayMs(userKey);
  if (delay === null) return;
  pendingAnswerRetryTimer = setTimeout(() => {
    pendingAnswerRetryTimer = null;
    void syncPendingAnswers('timer');
  }, Math.min(Math.max(delay, options.minDelayMs ?? 250), 60000));
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
  if (!question) return;
  if (!canAutoAdvanceAfterCorrectAnswer({
    autoAdvanceOnCorrect: autoAdvanceOnCorrectFeature.value,
    currentIndex: currentIndex.value,
    questionCount: questions.value.length
  })) return;

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

function enqueueCurrentAnswer(
  question: any,
  userAnswer: string[],
  clientAnswerId: string,
  isCorrect: boolean,
  durationSeconds: number,
  officialAnswer: string[],
  explanationText: string
) {
  const userKey = pendingAnswerUserKey.value;
  if (!userKey) return;

  enqueuePendingAnswer(userKey, {
    clientAnswerId,
    questionId: String(question.id),
    practiceSessionId: ensurePracticeSessionId(),
    sessionKey: practiceResumeKey.value || undefined,
    questionIndex: currentIndex.value,
    scope: practiceSessionScope(),
    selectedAnswer: userAnswer.map((item) => String(item)),
    isCorrect,
    answer: officialAnswer.map((item) => String(item)),
    explanation: explanationText,
    answeredAt: new Date().toISOString(),
    retryCount: 0,
    lastTriedAt: '',
    status: 'pending',
    durationSeconds
  });
}

function markPendingAnswerAsSyncing(userKey: string, record: PendingAnswerRecord) {
  return updatePendingAnswer(userKey, record.clientAnswerId, (current) => ({
    ...current,
    status: 'syncing',
    retryCount: current.retryCount + 1,
    lastTriedAt: new Date().toISOString(),
    lastError: undefined,
    lastStatusCode: undefined
  }));
}

function markPendingAnswerSyncError(userKey: string, record: PendingAnswerRecord, error: unknown): PendingAnswerRecord['status'] {
  const status = pendingAnswerErrorStatus(error);
  const nextStatus: PendingAnswerRecord['status'] = status === 401 || status === 403
    ? 'auth_failed'
    : status === 400
      ? 'invalid'
      : 'failed';
  updatePendingAnswer(userKey, record.clientAnswerId, {
    status: nextStatus,
    lastError: pendingAnswerErrorMessage(error),
    lastStatusCode: status || undefined
  });
  markPracticeRecordSyncStatus(record, 'failed');
  return nextStatus;
}

function pendingAnswerPayload(record: PendingAnswerRecord) {
  return {
    questionId: record.questionId,
    practiceSessionId: record.practiceSessionId,
    selected: record.selectedAnswer,
    clientAnswerId: record.clientAnswerId,
    durationSeconds: record.durationSeconds || 0,
    isCorrect: record.isCorrect,
    answer: record.answer || [],
    explanation: record.explanation || ''
  };
}

function pendingAnswerFallbackResult(record: PendingAnswerRecord): PendingAnswerSyncResult {
  return {
    clientAnswerId: record.clientAnswerId,
    correct: record.isCorrect,
    answer: record.answer || [],
    explanation: record.explanation || '',
    queued: true,
    recorded: false
  };
}

async function syncPendingAnswerBatch(
  userKey: string,
  records: PendingAnswerRecord[],
  options: { practiceSessionId?: string; clientSubmissionId?: string } = {}
): Promise<PendingAnswerSyncStatus> {
  const uniqueRecords = dedupePendingAnswerRecords(records);
  if (!uniqueRecords.length) return 'synced' as const;
  const uniqueClientAnswerIds = new Set(uniqueRecords.map((record) => record.clientAnswerId));
  records.forEach((record) => {
    if (!uniqueClientAnswerIds.has(record.clientAnswerId)) removePendingAnswer(userKey, record.clientAnswerId);
  });

  try {
    const data = await api.post<PendingAnswerBatchResponse>('/practice/answers/batch', {
      practiceSessionId: options.practiceSessionId,
      clientSubmissionId: options.clientSubmissionId,
      scopeType: 'practice',
      scopeId: practiceSessionScope(),
      answers: uniqueRecords.map(pendingAnswerPayload)
    });
    const resultByClientAnswerId = new Map((data.results || []).map((item) => [item.clientAnswerId || '', item]));
    removePendingAnswersByClientAnswerIds(userKey, uniqueRecords.map((record) => record.clientAnswerId));
    uniqueRecords.forEach((record) => {
      applySyncedPendingAnswer(record, resultByClientAnswerId.get(record.clientAnswerId) || pendingAnswerFallbackResult(record));
    });
    window.dispatchEvent(new Event('qanda:stats-updated'));
    return 'synced' as const;
  } catch (error) {
    let nextStatus: PendingAnswerRecord['status'] = 'failed';
    uniqueRecords.forEach((record) => {
      nextStatus = markPendingAnswerSyncError(userKey, record, error);
    });
    return nextStatus;
  }
}

async function syncPendingAnswerSingle(userKey: string, record: PendingAnswerRecord): Promise<PendingAnswerSyncStatus> {
  try {
    const data = await api.post<PendingAnswerSyncResult>('/practice/answers', {
      questionId: record.questionId,
      selected: record.selectedAnswer,
      clientAnswerId: record.clientAnswerId,
      durationSeconds: record.durationSeconds || 0,
      isCorrect: record.answer ? record.isCorrect : undefined,
      answer: record.answer,
      explanation: record.explanation
    });
    removePendingAnswer(userKey, record.clientAnswerId);
    applySyncedPendingAnswer(record, data);
    window.dispatchEvent(new Event('qanda:stats-updated'));
    return 'synced' as const;
  } catch (error) {
    return markPendingAnswerSyncError(userKey, record, error);
  }
}

async function syncPendingAnswers(_reason: string, options: { resetAuthFailures?: boolean } = {}) {
  const userKey = pendingAnswerUserKey.value;
  if (!userKey) return;
  if (options.resetAuthFailures) resetAuthFailedPendingAnswers(userKey);
  if (pendingAnswerSyncRunning) {
    schedulePendingAnswerRetry();
    return;
  }

  const dueRecords = selectDuePendingAnswers(userKey)
    .sort((left, right) => Date.parse(left.answeredAt || '') - Date.parse(right.answeredAt || ''))
    .slice(0, PENDING_ANSWER_SYNC_BATCH_SIZE);
  const uniqueDueRecords = dedupePendingAnswerRecords(dueRecords);
  const uniqueDueClientAnswerIds = new Set(uniqueDueRecords.map((record) => record.clientAnswerId));
  dueRecords.forEach((record) => {
    if (!uniqueDueClientAnswerIds.has(record.clientAnswerId)) removePendingAnswer(userKey, record.clientAnswerId);
  });
  if (!uniqueDueRecords.length) {
    schedulePendingAnswerRetry();
    return;
  }

  pendingAnswerSyncRunning = true;
  clearPendingAnswerRetryTimer();

  try {
    const batchRecords: PendingAnswerRecord[] = [];
    let stoppedForAuthFailure = false;
    for (const record of uniqueDueRecords) {
      if (pendingAnswerUserKey.value !== userKey) break;
      const tryingRecord = markPendingAnswerAsSyncing(userKey, record);
      if (!tryingRecord) continue;

      if (tryingRecord.answer) {
        batchRecords.push(tryingRecord);
        continue;
      }

      const singleStatus = await syncPendingAnswerSingle(userKey, tryingRecord);
      if (singleStatus === 'auth_failed') {
        stoppedForAuthFailure = true;
        break;
      }
    }

    if (!stoppedForAuthFailure && batchRecords.length && pendingAnswerUserKey.value === userKey) {
      const batchStatus = await syncPendingAnswerBatch(userKey, batchRecords);
      if (batchStatus === 'auth_failed') return;
    }
  } finally {
    pendingAnswerSyncRunning = false;
    schedulePendingAnswerRetry();
  }
}

function currentPracticeSessionPendingRecords() {
  const userKey = pendingAnswerUserKey.value;
  const sessionId = ensurePracticeSessionId();
  if (!userKey || !sessionId) return [];
  return dedupePendingAnswerRecords(selectPendingAnswersByPracticeSession(userKey, sessionId))
    .filter((record) => record.status !== 'invalid');
}

function hasUnsubmittedCurrentPracticeSession() {
  if (sessionSubmitted.value) return false;
  return currentPracticeSessionPendingRecords().length > 0;
}

function createClientSubmissionId() {
  const randomId = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `${ensurePracticeSessionId()}:${randomId}`.slice(0, 120);
}

async function submitCurrentPracticeSession() {
  const userKey = pendingAnswerUserKey.value;
  if (!userKey) {
    showToast({ type: 'fail', message: '请先登录后再提交' });
    return false;
  }
  if (sessionSubmitting.value) return false;

  const records = currentPracticeSessionPendingRecords();
  if (!records.length) {
    sessionSubmitted.value = true;
    persistCurrentPracticeResume();
    return true;
  }

  sessionSubmitting.value = true;
  try {
    const status = await syncPendingAnswerBatch(userKey, records, {
      practiceSessionId: ensurePracticeSessionId(),
      clientSubmissionId: createClientSubmissionId()
    });
    if (status !== 'synced') {
      showToast({ type: 'fail', message: '提交失败，答案已暂存在本机，请稍后重试' });
      return false;
    }
    sessionSubmitted.value = true;
    persistCurrentPracticeResume();
    showToast({ type: 'success', message: '答案已提交' });
    return true;
  } catch {
    showToast({ type: 'fail', message: '提交失败，答案已暂存在本机，请稍后重试' });
    return false;
  } finally {
    sessionSubmitting.value = false;
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
  const questionId = String(question.id || '');
  if (!questionId || answerSubmitLocks.has(questionId)) return;
  answerSubmitLocks.add(questionId);

  const officialAnswer = getOfficialAnswer(question);
  const answerForCheck = question.type === 'fill' ? fillAnswerGroupsForCheck(question) : officialAnswer;
  const clientAnswerId = createClientAnswerId(questionId);
  const durationSeconds = currentQuestionDurationSeconds();
  const correct = question.type === 'fill'
    ? isFillAnswerCorrect(userAnswer, answerForCheck)
    : isAnswerCorrect(userAnswer, officialAnswer);
  applyAnswerResult(question, userAnswer, {
    correct,
    answer: officialAnswer,
    explanation: question.explanation || ''
  }, clientAnswerId, 'pending');

  enqueueCurrentAnswer(question, userAnswer, clientAnswerId, correct, durationSeconds, officialAnswer, question.explanation || '');
  sessionSubmitted.value = false;
  if (correct && autoAdvanceOnCorrectFeature.value) scheduleCorrectAnswerAutoAdvance(question);
  else clearCorrectAnswerAutoAdvanceTimer();
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

function setFavoriteSubmitting(questionId: string, submitting: boolean) {
  const next = { ...favoriteSubmittingByQuestionId.value };
  if (submitting) next[questionId] = true;
  else delete next[questionId];
  favoriteSubmittingByQuestionId.value = next;
}

async function toggleFavorite() {
  const question = currentQuestion.value;
  const questionId = String(question?.id || '');
  if (!question || !questionId || favoriteSubmittingByQuestionId.value[questionId]) return;

  const previousFavorite = Boolean(question.favorite);
  const nextFavorite = !previousFavorite;
  question.favorite = nextFavorite;
  setFavoriteSubmitting(questionId, true);

  try {
    const data = await api.post<{ favorite: boolean }>(`/practice/favorites/${questionId}/toggle`, { favorite: nextFavorite });
    question.favorite = data.favorite;
    showToast(data.favorite ? '已收藏' : '已取消收藏');
  } catch (e) {
    question.favorite = previousFavorite;
    showToast({ type: 'fail', message: e instanceof Error ? e.message : '收藏失败' });
  } finally {
    setFavoriteSubmitting(questionId, false);
  }
}

function prevQuestion() {
  clearCorrectAnswerAutoAdvanceTimer();
  if (canGoPrevious.value) currentIndex.value -= 1;
}

function nextQuestion() {
  clearCorrectAnswerAutoAdvanceTimer();
  if (currentIndex.value >= questions.value.length - 1) {
    finishQuiz();
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

async function finishQuiz() {
  clearCorrectAnswerAutoAdvanceTimer();
  if (sessionSubmitting.value) return;
  const hasUnansweredQuestions = unansweredQuestionCount.value > 0;
  if (hasUnansweredQuestions) {
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

  const submittedOk = await submitCurrentPracticeSession();
  if (!submittedOk) return;

  const shouldClearResume = shouldClearPracticeResumeOnExit(questions.value.length, unansweredQuestionCount.value);
  if (shouldClearResume) await clearCurrentPracticeResume();
  else await flushRemotePracticeResumeSync();

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
