<template>
  <section class="qx-page qx-home-page qx-home-time-page" :class="timeThemeClass" :style="timeThemeStyle">
    <header class="qx-page-header qx-home-time-header-strip">
      <div class="qx-home-time-header-copy">
        <h1>首页</h1>
      </div>
    </header>

    <van-loading v-if="loading" class="center-loading" type="spinner">加载中...</van-loading>

    <div v-else class="qx-home-grid qx-home-time-grid">
      <div class="qx-home-main qx-home-time-main">
        <RouterLink
          v-if="latestAnnouncement"
          class="qx-announcement-strip"
          :class="{
            'has-unread': hasUnreadAnnouncements,
            'has-fresh-unread': hasFreshUnreadAnnouncement,
            'is-pinned': latestAnnouncement.pinned || latestAnnouncement.isPinned
          }"
          to="/announcements"
          aria-label="查看最新公告"
        >
          <span class="qx-announcement-speaker" aria-hidden="true">
            <svg class="qx-announcement-mega-art" viewBox="0 0 64 64" focusable="false">
              <defs>
                <linearGradient id="announcement-horn-body" x1="12" x2="54" y1="9" y2="53" gradientUnits="userSpaceOnUse">
                  <stop offset="0" stop-color="#fff6a6" />
                  <stop offset=".48" stop-color="#ffad21" />
                  <stop offset="1" stop-color="#ff5c7a" />
                </linearGradient>
                <linearGradient id="announcement-horn-blue" x1="10" x2="44" y1="18" y2="50" gradientUnits="userSpaceOnUse">
                  <stop offset="0" stop-color="#62dcff" />
                  <stop offset=".58" stop-color="#1689ff" />
                  <stop offset="1" stop-color="#2557d6" />
                </linearGradient>
                <linearGradient id="announcement-horn-shadow" x1="20" x2="47" y1="19" y2="48" gradientUnits="userSpaceOnUse">
                  <stop offset="0" stop-color="#ffffff" stop-opacity=".86" />
                  <stop offset=".45" stop-color="#ffffff" stop-opacity=".26" />
                  <stop offset="1" stop-color="#ffffff" stop-opacity="0" />
                </linearGradient>
              </defs>
              <path class="qx-announcement-mega-glow" d="M9 32c0-13.2 10.7-23.9 23.9-23.9 12.4 0 22.6 9.5 23.7 21.6C58 44.8 47 56.2 32 56.2 18.9 56.2 9 45.4 9 32Z" />
              <path class="qx-announcement-mega-wave" d="M49.1 19.1c3.8 3.3 5.8 7.6 5.8 12.9s-2 9.7-5.8 12.9" />
              <path class="qx-announcement-mega-wave wide" d="M54.2 13.2c5.4 4.8 8.3 11.1 8.3 18.8s-2.9 14-8.3 18.8" />
              <path class="qx-announcement-mega-mouth" d="M8.5 25.6h13.2v14.8H8.5a4 4 0 0 1-4-4v-6.8a4 4 0 0 1 4-4Z" />
              <path class="qx-announcement-mega-horn" d="M21.2 25.1 48.8 10.4a2.9 2.9 0 0 1 4.2 2.6v38a2.9 2.9 0 0 1-4.2 2.6L21.2 38.9V25.1Z" />
              <path class="qx-announcement-mega-shine" d="M24.5 26.8 47.9 14.4c.9-.5 2 .2 2 1.3v5.2L24.5 33.4v-6.6Z" />
              <text class="qx-announcement-mega-label" x="28.6" y="36.1" transform="rotate(-9 38 32)">公告</text>
              <path class="qx-announcement-mega-handle" d="M18.1 39.5h10.2l4.1 13.7a3.2 3.2 0 0 1-3.1 4.1h-5.4a3.2 3.2 0 0 1-3.1-2.5l-2.7-15.3Z" />
              <path class="qx-announcement-mega-handle-shine" d="M22.8 41.5h3.7l2.6 9.4" />
              <path class="qx-announcement-mega-spark s1" d="M12 11.7v6.1M9 14.8h6" />
              <path class="qx-announcement-mega-spark s2" d="M40.8 5.8v5M38.3 8.3h5" />
              <path class="qx-announcement-mega-spark s3" d="M58.2 28.4v4.4M56 30.6h4.4" />
            </svg>
            <i class="qx-announcement-wave"></i>
            <i class="qx-announcement-wave"></i>
          </span>
          <span class="qx-announcement-copy">
            <span class="qx-announcement-kicker">
              <b>公告</b>
              <span v-if="latestAnnouncement.pinned || latestAnnouncement.isPinned" class="qx-announcement-pin-badge inline">已置顶</span>
              <span v-if="homeAnnouncementDate" class="qx-announcement-home-date">{{ homeAnnouncementDate }}</span>
              <span class="qx-announcement-home-time">{{ homeAnnouncementTime }}</span>
              <span>{{ latestAnnouncement.readCount || 0 }} 人已读</span>
            </span>
            <strong>{{ latestAnnouncement.title }}</strong>
          </span>
          <span class="qx-announcement-cta">
            查看
            <QxIcon name="chevron-right" />
          </span>
        </RouterLink>

        <section class="qx-time-visual-card" aria-label="时间问候">
          <img
            class="qx-time-visual-image"
            :src="currentTimeVisual.image"
            :srcset="currentTimeVisual.srcset"
            sizes="(max-width: 640px) 100vw, (max-width: 1080px) 860px, 520px"
            :alt="currentTimeVisual.imageAlt"
            fetchpriority="high"
          />
          <div class="qx-time-visual-shade"></div>
          <div class="qx-time-visual-content">
            <span class="qx-time-pill">{{ currentTimeVisual.badge }}</span>
            <div>
              <h2>{{ currentTimeVisual.title }}</h2>
              <p>{{ currentTimeVisual.subtitle }}</p>
            </div>
          </div>
        </section>

        <section class="qx-card qx-study-panel qx-study-panel-time">
          <div class="qx-card-head">
            <div class="qx-card-title-row">
              <span class="qx-blue-icon" aria-hidden="true">
                <QxIcon name="dashboard" tone="light" />
              </span>
              <div>
                <h2>学习数据</h2>
                <p>真实练习概览</p>
              </div>
            </div>
            <RouterLink class="qx-mini-link" to="/stats">
              详情
              <QxIcon name="chevron-right" />
            </RouterLink>
          </div>

          <div class="qx-study-big-stat qx-study-total-card">
            <span>题目总数</span>
            <div class="qx-study-total-row">
              <svg
                class="qx-study-total-number-svg"
                viewBox="0 0 320 96"
                preserveAspectRatio="xMinYMid meet"
                role="img"
                :aria-label="`题目总数 ${totalQuestions}`"
              >
                <defs>
                  <linearGradient :id="numberGradientId" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" :stop-color="currentTimeVisual.numberGradientStart" />
                    <stop offset="52%" :stop-color="currentTimeVisual.numberGradientMid" />
                    <stop offset="100%" :stop-color="currentTimeVisual.numberGradientEnd" />
                  </linearGradient>
                </defs>
                <text x="0" y="76" class="qx-study-total-number-text" :fill="`url(#${numberGradientId})`">{{ totalQuestions }}</text>
              </svg>
              <RouterLink class="qx-practice-now-btn" to="/library">去刷题</RouterLink>
            </div>
          </div>

          <div class="qx-study-stat-grid">
            <RouterLink class="qx-study-stat" to="/stats">
              <span class="green" aria-hidden="true"><QxIcon name="check-circle" tone="light" /></span>
              <em>已完成</em>
              <strong>{{ stats.answerCount || 0 }}</strong>
            </RouterLink>
            <RouterLink class="qx-study-stat" to="/wrongs">
              <span class="red" aria-hidden="true"><QxIcon name="x-circle" tone="light" /></span>
              <em>错题</em>
              <strong>{{ stats.wrongQuestionCount || 0 }}</strong>
            </RouterLink>
            <RouterLink class="qx-study-stat" to="/stats">
              <span class="orange" aria-hidden="true"><QxIcon name="target" tone="light" /></span>
              <em>正确率</em>
              <strong>{{ stats.accuracy || 0 }}%</strong>
            </RouterLink>
            <RouterLink class="qx-study-stat" to="/stats">
              <span class="blue" aria-hidden="true"><QxIcon name="clock" tone="light" /></span>
              <em>学习时长</em>
              <strong>{{ studySecondsLabel }}</strong>
            </RouterLink>
          </div>
        </section>
      </div>
    </div>

    <van-dialog
      v-model:show="showPinnedAnnouncementDialog"
      class-name="qx-announcement-dialog qx-home-pinned-announcement-dialog"
      title="置顶公告"
      confirm-button-text="我知道了"
      :before-close="beforePinnedAnnouncementClose"
      @closed="clearPinnedAnnouncementDialog"
    >
      <div
        ref="pinnedAnnouncementScrollRef"
        class="qx-announcement-dialog-scroll"
        @touchstart.stop
        @touchmove.stop
        @wheel.stop
      >
        <article v-if="activePinnedAnnouncement" class="qx-announcement-detail qx-announcement-dialog-detail">
          <div class="qx-announcement-detail-head">
            <span class="qx-announcement-category">{{ activePinnedAnnouncement.category }}</span>
            <span class="qx-announcement-pin-badge detail">已置顶</span>
            <span class="qx-announcement-status">未读</span>
          </div>
          <h2>{{ activePinnedAnnouncement.title }}</h2>
          <p class="qx-announcement-meta">
            {{ activePinnedAnnouncement.publisher }} · {{ activePinnedAnnouncement.publishedAt }} · {{ activePinnedAnnouncement.readCount || 0 }} 人已读
          </p>
          <div
            class="qx-announcement-content qx-announcement-markdown"
            v-html="renderAnnouncementContent(activePinnedAnnouncement)"
            @click="handlePinnedAnnouncementCopy"
          ></div>
        </article>
      </div>
    </van-dialog>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { showToast } from 'vant';
import { api } from '../api/request';
import QxIcon from '../components/QxIcon.vue';
import type { AnnouncementItem } from '../data/announcementMock';
import { useAuthStore } from '../stores/auth';
import type { StatsPayload } from '../types/stats';
import { defaultStatsPayload } from '../types/stats';
import { copyTextToClipboard } from '../utils/clipboard';
import { decodeMarkdownCode, renderMarkdown } from '../utils/markdown';
import { formatDuration } from '../utils/duration';
import '../styles/announcements.css';
import '../styles/home-time.css';

type TimeVisualKey = 'dawn' | 'morning' | 'noon' | 'afternoon' | 'evening' | 'night';

type TimeVisualConfig = {
  badge: string;
  titlePrefix: string;
  subtitle: string;
  imageAlt: string;
  accent: string;
  accentDark: string;
  numberGradientStart: string;
  numberGradientMid: string;
  numberGradientEnd: string;
  totalCardBackground: string;
  glow: string;
  headerBackground: string;
  headerShadow: string;
  metricDone: string;
  metricDoneDark: string;
  metricWrong: string;
  metricWrongDark: string;
  metricAccuracy: string;
  metricAccuracyDark: string;
  metricDuration: string;
  metricDurationDark: string;
};

const auth = useAuthStore();
const stats = ref<StatsPayload>(defaultStatsPayload());
const loading = ref(true);
const currentHour = ref(new Date().getHours());
const announcements = ref<AnnouncementItem[]>([]);
const showPinnedAnnouncementDialog = ref(false);
const activePinnedAnnouncement = ref<AnnouncementItem | null>(null);
const pinnedAnnouncementScrollRef = ref<HTMLElement | null>(null);
let hourTimer: number | undefined;

const assetBase = `${import.meta.env.BASE_URL.replace(/\/$/, '')}/assets/home-time`;

const timeVisualConfig: Record<TimeVisualKey, TimeVisualConfig> = {
  dawn: {
    badge: '清晨时光',
    titlePrefix: '清晨好',
    subtitle: '新的一天，从一道题开始慢慢进入状态。',
    imageAlt: '清晨晨光下的书桌学习场景',
    accent: '#ff9f43',
    accentDark: '#e67e22',
    numberGradientStart: '#ffcf7a',
    numberGradientMid: '#ff8a45',
    numberGradientEnd: '#6d8fe8',
    totalCardBackground: 'linear-gradient(135deg, rgba(255, 244, 232, .96) 0%, rgba(255, 251, 246, .88) 52%, rgba(237, 246, 255, .92) 100%)',
    glow: '0 12px 24px rgba(255, 159, 67, .24)',
    headerBackground: 'radial-gradient(circle at 92% 18%, rgba(255,255,255,.24), transparent 30%), linear-gradient(135deg, #ff9f43 0%, #4d91ff 100%)',
    headerShadow: '0 14px 32px rgba(255, 159, 67, .22)',
    metricDone: '#7aa35a',
    metricDoneDark: '#4d7f39',
    metricWrong: '#d96b52',
    metricWrongDark: '#b84a35',
    metricAccuracy: '#f2b544',
    metricAccuracyDark: '#d88a1d',
    metricDuration: '#6d7fd8',
    metricDurationDark: '#485fc4'
  },
  morning: {
    badge: '上午时光',
    titlePrefix: '上午好',
    subtitle: '保持专注，把容易混淆的知识点再巩固一遍。',
    imageAlt: '上午阳光明亮的书桌学习场景',
    accent: '#1687f8',
    accentDark: '#0f74e8',
    numberGradientStart: '#1687f8',
    numberGradientMid: '#52c7df',
    numberGradientEnd: '#f6c453',
    totalCardBackground: 'linear-gradient(135deg, rgba(232, 245, 255, .96) 0%, rgba(247, 251, 255, .90) 58%, rgba(255, 248, 224, .78) 100%)',
    glow: '0 12px 24px rgba(22, 135, 248, .22)',
    headerBackground: 'radial-gradient(circle at 92% 18%, rgba(255,255,255,.24), transparent 30%), linear-gradient(135deg, #1687f8 0%, #4d91ff 100%)',
    headerShadow: '0 14px 32px rgba(22, 135, 248, .20)',
    metricDone: '#6fba5b',
    metricDoneDark: '#3e8d42',
    metricWrong: '#ef6f74',
    metricWrongDark: '#dc4c58',
    metricAccuracy: '#f6c453',
    metricAccuracyDark: '#d89b1d',
    metricDuration: '#35b8de',
    metricDurationDark: '#1687f8'
  },
  noon: {
    badge: '午间时光',
    titlePrefix: '中午好',
    subtitle: '适当放慢节奏，也可以用几道题保持手感。',
    imageAlt: '中午强烈日光下的书桌学习场景',
    accent: '#0ea5e9',
    accentDark: '#0284c7',
    numberGradientStart: '#0ea5e9',
    numberGradientMid: '#38d5ff',
    numberGradientEnd: '#ffd76f',
    totalCardBackground: 'linear-gradient(135deg, rgba(236, 254, 255, .96) 0%, rgba(248, 251, 255, .88) 55%, rgba(255, 248, 215, .80) 100%)',
    glow: '0 12px 24px rgba(14, 165, 233, .24)',
    headerBackground: 'radial-gradient(circle at 92% 18%, rgba(255,255,255,.24), transparent 30%), linear-gradient(135deg, #0ea5e9 0%, #38bdf8 100%)',
    headerShadow: '0 14px 32px rgba(14, 165, 233, .20)',
    metricDone: '#86b85f',
    metricDoneDark: '#5c9846',
    metricWrong: '#f47a67',
    metricWrongDark: '#d95745',
    metricAccuracy: '#f7d15f',
    metricAccuracyDark: '#dca728',
    metricDuration: '#38bdf8',
    metricDurationDark: '#0ea5e9'
  },
  afternoon: {
    badge: '下午时光',
    titlePrefix: '下午好',
    subtitle: '适合集中练习，把今天的错题及时消化。',
    imageAlt: '下午金色斜阳下的书桌学习场景',
    accent: '#f59e0b',
    accentDark: '#d97706',
    numberGradientStart: '#f8c15a',
    numberGradientMid: '#f59e0b',
    numberGradientEnd: '#5b86e8',
    totalCardBackground: 'linear-gradient(135deg, rgba(255, 247, 237, .96) 0%, rgba(255, 238, 207, .84) 52%, rgba(242, 247, 255, .88) 100%)',
    glow: '0 12px 24px rgba(245, 158, 11, .24)',
    headerBackground: 'radial-gradient(circle at 92% 18%, rgba(255,255,255,.24), transparent 30%), linear-gradient(135deg, #f59e0b 0%, #4d91ff 100%)',
    headerShadow: '0 14px 32px rgba(245, 158, 11, .22)',
    metricDone: '#8ca667',
    metricDoneDark: '#6b8b4a',
    metricWrong: '#e8754f',
    metricWrongDark: '#c9512e',
    metricAccuracy: '#f59e0b',
    metricAccuracyDark: '#d97706',
    metricDuration: '#5b86e8',
    metricDurationDark: '#3f63c9'
  },
  evening: {
    badge: '晚间复盘',
    titlePrefix: '晚上好',
    subtitle: '复盘比刷题更重要，看看今天还有哪些薄弱点。',
    imageAlt: '傍晚晚霞下的书桌学习场景',
    accent: '#fb7185',
    accentDark: '#e11d48',
    numberGradientStart: '#ff9b68',
    numberGradientMid: '#fb7185',
    numberGradientEnd: '#8b70d6',
    totalCardBackground: 'linear-gradient(135deg, rgba(255, 241, 242, .96) 0%, rgba(255, 237, 232, .82) 50%, rgba(238, 242, 255, .92) 100%)',
    glow: '0 12px 24px rgba(251, 113, 133, .24)',
    headerBackground: 'radial-gradient(circle at 92% 18%, rgba(255,255,255,.20), transparent 30%), linear-gradient(135deg, #fb7185 0%, #6366f1 100%)',
    headerShadow: '0 14px 32px rgba(251, 113, 133, .22)',
    metricDone: '#6f7d5f',
    metricDoneDark: '#4e6548',
    metricWrong: '#d6764f',
    metricWrongDark: '#b45335',
    metricAccuracy: '#f49e63',
    metricAccuracyDark: '#dc762d',
    metricDuration: '#8b70d6',
    metricDurationDark: '#6366f1'
  },
  night: {
    badge: '夜间时光',
    titlePrefix: '夜深了',
    subtitle: '保持节奏，也别忘了休息。',
    imageAlt: '夜晚月光和台灯下的书桌学习场景',
    accent: '#3b82f6',
    accentDark: '#2563eb',
    numberGradientStart: '#6ea8ff',
    numberGradientMid: '#3b82f6',
    numberGradientEnd: '#d4a86a',
    totalCardBackground: 'linear-gradient(135deg, rgba(238, 244, 255, .96) 0%, rgba(247, 251, 255, .88) 58%, rgba(245, 232, 205, .70) 100%)',
    glow: '0 12px 24px rgba(59, 130, 246, .26)',
    headerBackground: 'radial-gradient(circle at 92% 18%, rgba(255,255,255,.16), transparent 30%), linear-gradient(135deg, #1d4ed8 0%, #172033 100%)',
    headerShadow: '0 14px 32px rgba(29, 78, 216, .24)',
    metricDone: '#5c7a67',
    metricDoneDark: '#3d5f51',
    metricWrong: '#8a5c72',
    metricWrongDark: '#6d3f58',
    metricAccuracy: '#d4a86a',
    metricAccuracyDark: '#a2763f',
    metricDuration: '#4f7bc8',
    metricDurationDark: '#2754a6'
  }
};

function getTimeVisualKey(hour: number): TimeVisualKey {
  if (hour >= 5 && hour < 8) return 'dawn';
  if (hour >= 8 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 14) return 'noon';
  if (hour >= 14 && hour < 18) return 'afternoon';
  if (hour >= 18 && hour < 22) return 'evening';
  return 'night';
}

function homeTimeImagePath(key: TimeVisualKey, width: 640 | 960) {
  return `${assetBase}/${key}-${width}.webp`;
}

const displayName = computed(() => auth.user?.nickname || auth.user?.username || '同学');
const timeVisualKey = computed(() => getTimeVisualKey(currentHour.value));
const numberGradientId = 'home-total-number-gradient';
const currentTimeVisual = computed(() => {
  const key = timeVisualKey.value;
  const config = timeVisualConfig[key];
  return {
    ...config,
    image: homeTimeImagePath(key, 960),
    srcset: `${homeTimeImagePath(key, 640)} 640w, ${homeTimeImagePath(key, 960)} 960w`,
    title: `${config.titlePrefix}，${displayName.value}`
  };
});
const timeThemeClass = computed(() => `is-home-time-${timeVisualKey.value}`);
const timeThemeStyle = computed(() => ({
  '--home-time-accent': currentTimeVisual.value.accent,
  '--home-time-accent-dark': currentTimeVisual.value.accentDark,
  '--home-time-total-bg': currentTimeVisual.value.totalCardBackground,
  '--home-time-glow': currentTimeVisual.value.glow,
  '--home-time-header': currentTimeVisual.value.headerBackground,
  '--home-time-header-shadow': currentTimeVisual.value.headerShadow,
  '--home-time-done': currentTimeVisual.value.metricDone,
  '--home-time-done-dark': currentTimeVisual.value.metricDoneDark,
  '--home-time-wrong': currentTimeVisual.value.metricWrong,
  '--home-time-wrong-dark': currentTimeVisual.value.metricWrongDark,
  '--home-time-accuracy': currentTimeVisual.value.metricAccuracy,
  '--home-time-accuracy-dark': currentTimeVisual.value.metricAccuracyDark,
  '--home-time-duration': currentTimeVisual.value.metricDuration,
  '--home-time-duration-dark': currentTimeVisual.value.metricDurationDark
}));
const totalQuestions = computed(() => Number(stats.value.totalQuestionCount || 0));
const studySecondsLabel = computed(() => formatDuration(Number(stats.value.totalDurationSeconds || 0)));
const latestAnnouncement = computed(() => announcements.value[0] || null);
const unreadAnnouncements = computed(() => announcements.value.filter((item) => !item.read));
const pinnedUnreadAnnouncement = computed(() => announcements.value.find((item) => (
  (item.pinned || item.isPinned) && !item.read
)) || null);
const hasUnreadAnnouncements = computed(() => unreadAnnouncements.value.length > 0);
const hasFreshUnreadAnnouncement = computed(() => unreadAnnouncements.value.some((item) => isFreshAnnouncement(item)));

function splitAnnouncementDateTime(value?: string | null) {
  const raw = String(value || '').trim();
  const matched = raw.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})/);
  if (matched) return { date: matched[1], time: matched[2] };
  const timeOnly = raw.match(/(\d{2}:\d{2})/);
  return { date: '', time: timeOnly?.[1] || raw };
}

function isFreshAnnouncement(item?: AnnouncementItem | null) {
  const raw = String(item?.publishedAt || '').trim();
  const matched = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:\s+(\d{2}):(\d{2}))?/);
  if (!matched) return false;
  const publishedAt = new Date(
    Number(matched[1]),
    Number(matched[2]) - 1,
    Number(matched[3]),
    Number(matched[4] || 0),
    Number(matched[5] || 0)
  ).getTime();
  const age = Date.now() - publishedAt;
  return age >= 0 && age <= 1000 * 60 * 60 * 24 * 3;
}

const homeAnnouncementDate = computed(() => splitAnnouncementDateTime(latestAnnouncement.value?.publishedAt).date);
const homeAnnouncementTime = computed(() => splitAnnouncementDateTime(latestAnnouncement.value?.publishedAt).time);

function renderAnnouncementContent(item: AnnouncementItem) {
  const content = item.content || [];
  const markdown = content.length <= 1 ? (content[0] || '') : content.join('\n');
  return renderMarkdown(markdown);
}

function showUnreadPinnedAnnouncementIfNeeded() {
  if (!pinnedUnreadAnnouncement.value) return;
  activePinnedAnnouncement.value = pinnedUnreadAnnouncement.value;
  showPinnedAnnouncementDialog.value = true;
  void nextTick(() => {
    if (pinnedAnnouncementScrollRef.value) pinnedAnnouncementScrollRef.value.scrollTop = 0;
  });
}

function clearPinnedAnnouncementDialog() {
  activePinnedAnnouncement.value = null;
}

function updateAnnouncementReadState(id: string, readCount?: number) {
  announcements.value = announcements.value.map((item) => (
    item.id === id
      ? {
        ...item,
        read: true,
        readCount: typeof readCount === 'number' ? readCount : item.readCount
      }
      : item
  ));
}

async function beforePinnedAnnouncementClose(action: string) {
  if (action !== 'confirm') return false;
  const announcement = activePinnedAnnouncement.value;
  if (!announcement) return true;

  try {
    const result = await api.post<{ read: boolean; readCount?: number }>(`/announcements/${announcement.id}/read`);
    updateAnnouncementReadState(announcement.id, result.readCount);
    showToast('公告已读');
    return true;
  } catch (error) {
    showToast({ type: 'fail', message: error instanceof Error ? error.message : '标记公告已读失败' });
    return false;
  }
}

async function handlePinnedAnnouncementCopy(event: MouseEvent) {
  const target = event.target as HTMLElement | null;
  const button = target?.closest<HTMLButtonElement>('[data-md-copy="code"]');
  if (!button) return;

  const code = decodeMarkdownCode(button.dataset.code || '');
  if (!code) return;

  if (await copyTextToClipboard(code)) {
    showToast('代码已复制');
    return;
  }
  showToast({ type: 'fail', message: '复制失败，请长按选择代码复制' });
}

onMounted(async () => {
  hourTimer = window.setInterval(() => {
    currentHour.value = new Date().getHours();
  }, 60 * 1000);

  try {
    const [statsPayload, announcementRows] = await Promise.all([
      api.get<StatsPayload>('/practice/stats'),
      api.get<AnnouncementItem[]>('/announcements').catch(() => [] as AnnouncementItem[])
    ]);
    stats.value = statsPayload;
    announcements.value = announcementRows;
    showUnreadPinnedAnnouncementIfNeeded();
  } catch (e) {
    showToast({ type: 'fail', message: e instanceof Error ? e.message : '首页数据加载失败' });
  } finally {
    loading.value = false;
  }
});

onBeforeUnmount(() => {
  if (hourTimer) window.clearInterval(hourTimer);
});
</script>
