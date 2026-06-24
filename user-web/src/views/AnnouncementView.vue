<template>
  <section class="qx-page qx-announcement-page">
    <header class="qx-page-header qx-announcement-header">
      <div>
        <h1>公告</h1>
      </div>
      <div class="qx-announcement-header-actions">
        <RouterLink class="qx-header-pill solid qx-announcement-home-link" to="/">返回首页</RouterLink>
      </div>
    </header>

    <div class="qx-announcement-layout">
      <aside class="qx-announcement-list" aria-label="公告列表">
        <div v-if="!announcements.length" class="qx-announcement-empty">
          <strong>暂无公告</strong>
          <span>后台发布后会同步显示在这里。</span>
        </div>
        <button
          v-for="item in announcements"
          :key="item.id"
          class="qx-announcement-list-item"
          :class="{ unread: !isRead(item.id) }"
          type="button"
          @click="selectAnnouncement(item.id)"
        >
          <span class="qx-announcement-item-top">
            <span class="qx-announcement-item-labels">
              <b>{{ item.category }}</b>
              <span v-if="item.pinned || item.isPinned" class="qx-announcement-pin-badge">已置顶</span>
            </span>
            <span class="qx-announcement-item-meta">
              <em>{{ item.publishedAt }}</em>
              <span class="qx-announcement-read-count">{{ item.readCount || 0 }} 人已读</span>
            </span>
          </span>
          <strong>{{ item.title }}</strong>
          <span class="qx-announcement-item-summary">{{ item.summary }}</span>
          <span class="qx-announcement-item-arrow" aria-hidden="true">
            <QxIcon name="chevron-right" />
          </span>
        </button>
      </aside>

      <article v-if="selectedAnnouncement" class="qx-announcement-detail">
        <div class="qx-announcement-detail-head">
          <span class="qx-announcement-category">{{ selectedAnnouncement.category }}</span>
          <span v-if="selectedAnnouncement.pinned || selectedAnnouncement.isPinned" class="qx-announcement-pin-badge detail">已置顶</span>
          <span class="qx-announcement-status" :class="{ read: isRead(selectedAnnouncement.id) }">
            {{ isRead(selectedAnnouncement.id) ? '已读' : '未读' }}
          </span>
        </div>
        <h2>{{ selectedAnnouncement.title }}</h2>
        <p class="qx-announcement-meta">
          {{ selectedAnnouncement.publisher }} · {{ selectedAnnouncement.publishedAt }} · {{ selectedAnnouncement.readCount || 0 }} 人已读
        </p>
        <div
          class="qx-announcement-content qx-announcement-markdown"
          v-html="renderAnnouncementContent(selectedAnnouncement)"
          @click="handleMarkdownCopy"
        ></div>

      </article>
    </div>

    <van-dialog
      v-model:show="showDetailDialog"
      class-name="qx-announcement-dialog"
      title="公告详情"
      confirm-button-text="知道了"
      close-on-click-overlay
      @confirm="closeDetailDialog"
    >
      <div
        ref="dialogScrollRef"
        class="qx-announcement-dialog-scroll"
        @touchstart.stop
        @touchmove.stop
        @wheel.stop
      >
        <article v-if="selectedAnnouncement" class="qx-announcement-detail qx-announcement-dialog-detail">
        <div class="qx-announcement-detail-head">
          <span class="qx-announcement-category">{{ selectedAnnouncement.category }}</span>
          <span v-if="selectedAnnouncement.pinned || selectedAnnouncement.isPinned" class="qx-announcement-pin-badge detail">已置顶</span>
          <span class="qx-announcement-status" :class="{ read: isRead(selectedAnnouncement.id) }">
            {{ isRead(selectedAnnouncement.id) ? '已读' : '未读' }}
          </span>
        </div>
        <h2>{{ selectedAnnouncement.title }}</h2>
        <p class="qx-announcement-meta">
          {{ selectedAnnouncement.publisher }} · {{ selectedAnnouncement.publishedAt }} · {{ selectedAnnouncement.readCount || 0 }} 人已读
        </p>
        <div
          class="qx-announcement-content qx-announcement-markdown"
          v-html="renderAnnouncementContent(selectedAnnouncement)"
          @click="handleMarkdownCopy"
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
import { decodeMarkdownCode, renderMarkdown } from '../utils/markdown';
import '../styles/announcements.css';

const COMPACT_ANNOUNCEMENT_QUERY = '(max-width: 980px), (hover: none) and (pointer: coarse)';

const announcements = ref<AnnouncementItem[]>([]);
const selectedId = ref('');
const readIds = ref(new Set<string>());
const showDetailDialog = ref(false);
const isCompactAnnouncement = ref(false);
const dialogScrollRef = ref<HTMLElement | null>(null);
let compactAnnouncementQuery: MediaQueryList | null = null;

const selectedAnnouncement = computed(() => announcements.value.find((item) => item.id === selectedId.value));

function isRead(id: string) {
  return readIds.value.has(id);
}

function selectAnnouncement(id: string) {
  selectedId.value = id;
  void markRead(id);
  if (isCompactAnnouncement.value) openDetailDialog();
}

function openDetailDialog() {
  showDetailDialog.value = true;
  void nextTick(() => {
    if (dialogScrollRef.value) dialogScrollRef.value.scrollTop = 0;
  });
}

function closeDetailDialog() {
  showDetailDialog.value = false;
}

function renderAnnouncementContent(item: AnnouncementItem) {
  const content = item.content || [];
  const markdown = content.length <= 1 ? (content[0] || '') : content.join('\n');
  return renderMarkdown(markdown);
}

async function handleMarkdownCopy(event: MouseEvent) {
  const target = event.target as HTMLElement | null;
  const button = target?.closest<HTMLButtonElement>('[data-md-copy="code"]');
  if (!button) return;

  const code = decodeMarkdownCode(button.dataset.code || '');
  if (!code) return;

  try {
    await navigator.clipboard.writeText(code);
    showToast('代码已复制');
  } catch {
    showToast({ type: 'fail', message: '复制失败' });
  }
}

async function loadAnnouncements() {
  try {
    const rows = await api.get<AnnouncementItem[]>('/announcements');
    announcements.value = rows;
    if (!rows.some((item) => item.id === selectedId.value)) selectedId.value = rows[0]?.id || '';
    readIds.value = new Set(rows.filter((item) => item.read).map((item) => item.id));
    markVisibleAnnouncementAsRead();
  } catch (error) {
    showToast({ type: 'fail', message: error instanceof Error ? error.message : '公告加载失败' });
  }
}

function updateAnnouncementReadCount(id: string, readCount: number) {
  announcements.value = announcements.value.map((item) => (
    item.id === id ? { ...item, readCount } : item
  ));
}

function markVisibleAnnouncementAsRead() {
  if (!selectedId.value) return;
  if (isCompactAnnouncement.value && !showDetailDialog.value) return;
  void markRead(selectedId.value);
}

async function markRead(id: string) {
  const before = new Set(readIds.value);
  const wasRead = before.has(id);
  readIds.value = new Set([...readIds.value, id]);
  if (!wasRead) {
    const current = announcements.value.find((item) => item.id === id);
    if (current) updateAnnouncementReadCount(id, Number(current.readCount || 0) + 1);
  }
  try {
    const result = await api.post<{ read: boolean; readCount?: number }>(`/announcements/${id}/read`);
    if (typeof result.readCount === 'number') updateAnnouncementReadCount(id, result.readCount);
  } catch (error) {
    readIds.value = before;
    void loadAnnouncements();
    showToast({ type: 'fail', message: error instanceof Error ? error.message : '标记已读失败' });
  }
}

function syncCompactAnnouncement() {
  isCompactAnnouncement.value = Boolean(compactAnnouncementQuery?.matches);
  if (!isCompactAnnouncement.value) {
    showDetailDialog.value = false;
    markVisibleAnnouncementAsRead();
  }
}

onMounted(() => {
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    compactAnnouncementQuery = window.matchMedia(COMPACT_ANNOUNCEMENT_QUERY);
    syncCompactAnnouncement();
    compactAnnouncementQuery.addEventListener('change', syncCompactAnnouncement);
  }
  void loadAnnouncements();
});

onBeforeUnmount(() => {
  compactAnnouncementQuery?.removeEventListener('change', syncCompactAnnouncement);
});
</script>
