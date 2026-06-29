<template>
  <section class="announcement-admin-page">
    <el-card class="announcement-admin-hero" shadow="never">
      <div>
        <span class="selection-kicker">Announcement Workspace</span>
        <h2>公告管理</h2>
        <p>新增或编辑后会立即发布到答题端，公告标签可自定义，阅读人数实时统计。</p>
      </div>
      <div class="announcement-admin-stats">
        <article>
          <span>全部公告</span>
          <strong>{{ announcementSummary.total }}</strong>
        </article>
        <article>
          <span>发布中</span>
          <strong>{{ announcementSummary.publishedCount }}</strong>
        </article>
        <article>
          <span>累计阅读</span>
          <strong>{{ announcementSummary.totalReadCount }}</strong>
        </article>
      </div>
    </el-card>

    <el-card class="panel-card announcement-admin-panel" shadow="never">
      <div class="announcement-admin-toolbar">
        <el-input
          v-model="query.keyword"
          placeholder="搜索公告标题、分类或内容"
          clearable
          @input="handleKeywordInput"
          @clear="handleSearch"
          @keyup.enter="handleSearch"
        >
          <template #prefix><el-icon><Search /></el-icon></template>
        </el-input>
        <el-button type="primary" @click="openCreate">
          <el-icon><Plus /></el-icon>
          新增公告
        </el-button>
      </div>

      <el-table v-loading="loading" class="question-table announcement-table" :data="filteredRows" stripe border>
        <el-table-column prop="title" label="公告标题" min-width="260" show-overflow-tooltip />
        <el-table-column label="分类" width="110">
          <template #default="{ row }">
            <el-tag effect="plain" type="warning">{{ row.categoryLabel }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="发布" width="90" align="center">
          <template #default="{ row }">
            <el-tag :type="row.isPublished ? 'success' : 'info'" effect="plain">{{ row.isPublished ? '是' : '否' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="置顶" width="92" align="center">
          <template #default="{ row }">
            <el-tag v-if="row.isPinned || row.pinned" type="danger" effect="plain">已置顶</el-tag>
            <el-tag v-else type="info" effect="plain">普通</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="阅读人数" width="110" align="center">
          <template #default="{ row }">
            <strong class="announcement-read-count">{{ row.readCount || 0 }}</strong>
          </template>
        </el-table-column>
        <el-table-column prop="publishedAt" label="发布时间" min-width="170" />
        <el-table-column prop="updatedAt" label="更新时间" min-width="170" />
        <el-table-column label="操作" width="312" fixed="right">
          <template #default="{ row }">
            <el-button size="small" @click="openEdit(row)">
              <el-icon><Edit /></el-icon>
              编辑
            </el-button>
            <el-button
              size="small"
              :type="row.isPinned || row.pinned ? 'warning' : 'primary'"
              plain
              :loading="pinningId === row.id"
              @click="togglePinned(row)"
            >
              {{ row.isPinned || row.pinned ? '取消置顶' : '置顶' }}
            </el-button>
            <el-button size="small" type="danger" plain @click="remove(row.id)">
              <el-icon><Delete /></el-icon>
              删除
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="announcement-admin-mobile-list">
        <article v-for="row in filteredRows" :key="row.id">
          <div class="announcement-admin-mobile-card-head">
            <strong>{{ row.title }}</strong>
            <span class="announcement-admin-mobile-tags">
              <el-tag v-if="row.isPinned || row.pinned" type="danger" effect="plain">已置顶</el-tag>
              <el-tag :type="row.isPublished ? 'success' : 'info'">{{ row.isPublished ? '已发布' : '未发布' }}</el-tag>
            </span>
          </div>
          <p>{{ row.summary }}</p>
          <div class="announcement-admin-mobile-meta">
            <span>{{ row.categoryLabel }}</span>
            <span>{{ row.publishedAt }}</span>
            <span>{{ row.isPublished ? '已发布' : '未发布' }}</span>
            <span v-if="row.isPinned || row.pinned">已置顶</span>
            <span>{{ row.readCount || 0 }} 人已读</span>
          </div>
          <div class="announcement-admin-mobile-actions">
            <el-button size="small" @click="openEdit(row)">
              <el-icon><Edit /></el-icon>
              编辑
            </el-button>
            <el-button
              size="small"
              :type="row.isPinned || row.pinned ? 'warning' : 'primary'"
              plain
              :loading="pinningId === row.id"
              @click="togglePinned(row)"
            >
              {{ row.isPinned || row.pinned ? '取消置顶' : '置顶' }}
            </el-button>
            <el-button size="small" type="danger" plain @click="remove(row.id)">
              <el-icon><Delete /></el-icon>
              删除
            </el-button>
          </div>
        </article>
      </div>

      <el-pagination
        v-if="meta.total > meta.pageSize"
        v-model:current-page="meta.page"
        class="pager announcement-admin-pager"
        layout="prev, pager, next, total"
        :total="meta.total"
        :page-size="meta.pageSize"
        @current-change="loadRows"
      />
    </el-card>

    <el-dialog
      v-model="dialogVisible"
      :title="form.id ? '编辑公告' : '新增公告'"
      width="min(860px, calc(100vw - 32px))"
      class="announcement-editor-dialog"
      align-center
    >
      <el-form label-position="top" class="announcement-form">
        <section class="announcement-form-section">
          <div class="announcement-form-section-head">
            <strong>基础信息</strong>
          </div>
          <div class="announcement-form-grid">
            <el-form-item label="公告标题">
              <el-input v-model="form.title" maxlength="160" show-word-limit />
            </el-form-item>
            <el-form-item label="公告标签">
              <div class="announcement-form-inline">
                <el-input v-model="form.categoryLabel" placeholder="例如：公告、维护、题库更新" maxlength="40" clearable />
                <div class="announcement-tag-presets" aria-label="常用公告标签">
                  <el-button
                    v-for="item in categoryOptions"
                    :key="item"
                    size="small"
                    plain
                    @click="form.categoryLabel = item"
                  >
                    {{ item }}
                  </el-button>
                </div>
              </div>
            </el-form-item>
          </div>
          <el-form-item label="公告摘要">
            <el-input v-model="form.summary" type="textarea" :rows="2" maxlength="300" show-word-limit />
          </el-form-item>
        </section>

        <section class="announcement-form-section">
          <div class="announcement-form-section-head">
            <strong>正文内容</strong>
          </div>
          <el-form-item label="公告内容">
            <el-input v-model="form.content" type="textarea" :rows="10" placeholder="支持 Markdown，例如标题、列表、代码块和图片链接。" />
          </el-form-item>
        </section>

        <section class="announcement-form-section">
          <div class="announcement-form-section-head">
            <strong>发布设置</strong>
          </div>
          <div class="announcement-publish-grid">
            <el-form-item label="发布方式">
              <div class="announcement-publish-note">
                <el-tag type="success" effect="plain">立即发布</el-tag>
              </div>
            </el-form-item>
            <el-form-item label="置顶公告">
              <div class="announcement-publish-note">
                <el-switch v-model="form.isPinned" active-text="置顶" inactive-text="不置顶" />
              </div>
            </el-form-item>
          </div>
        </section>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">立即发布公告</el-button>
      </template>
    </el-dialog>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { Delete, Edit, Plus, Search } from '@element-plus/icons-vue';
import { ElButton } from 'element-plus/es/components/button/index';
import { ElCard } from 'element-plus/es/components/card/index';
import { ElDialog } from 'element-plus/es/components/dialog/index';
import { ElForm, ElFormItem } from 'element-plus/es/components/form/index';
import { ElIcon } from 'element-plus/es/components/icon/index';
import { ElInput } from 'element-plus/es/components/input/index';
import { ElMessage } from 'element-plus/es/components/message/index';
import { ElMessageBox } from 'element-plus/es/components/message-box/index';
import { ElPagination } from 'element-plus/es/components/pagination/index';
import { ElSwitch } from 'element-plus/es/components/switch/index';
import { ElTable as ElTableBase, ElTableColumn as ElTableColumnBase } from 'element-plus/es/components/table/index';
import { ElTag } from 'element-plus/es/components/tag/index';
import { api } from '../api/request';

const ElTable = ElTableBase as any;
const ElTableColumn = ElTableColumnBase as any;

type AnnouncementTone = 'primary' | 'success' | 'info' | 'warning' | 'danger';

type AnnouncementAdminRow = {
  id: string;
  title: string;
  summary: string;
  content: string[];
  category: string;
  categoryLabel: string;
  statusLabel: string;
  statusTone: AnnouncementTone;
  publisher: string;
  isPublished: boolean;
  isPinned: boolean;
  pinned?: boolean;
  readCount: number;
  publishedAt: string;
  updatedAt: string;
};

type AnnouncementAdminPayload = {
  rows: AnnouncementAdminRow[];
  categoryOptions: string[];
  summary?: {
    total: number;
    publishedCount: number;
    totalReadCount: number;
  };
  meta?: {
    page: number;
    pageSize: number;
    total: number;
    pages: number;
  };
};

type AnnouncementForm = {
  id: string;
  title: string;
  summary: string;
  content: string;
  categoryLabel: string;
  statusLabel: string;
  statusTone: AnnouncementTone;
  publisher: string;
  isPublished: boolean;
  isPinned: boolean;
  publishedAt: string;
};

const rows = ref<AnnouncementAdminRow[]>([]);
const categoryOptions = ref<string[]>(['维护', '题库', '活动']);
const meta = reactive({ page: 1, pageSize: 20, total: 0, pages: 0 });
const summary = reactive({ total: 0, publishedCount: 0, totalReadCount: 0 });
const loading = ref(false);
const saving = ref(false);
const pinningId = ref('');
const dialogVisible = ref(false);
let searchTimer: number | undefined;

const query = reactive({
  keyword: ''
});

const emptyForm = (): AnnouncementForm => ({
  id: '',
  title: '',
  summary: '',
  content: '',
  categoryLabel: '公告',
  statusLabel: '已发布',
  statusTone: 'success',
  publisher: 'QandA 管理员',
  isPublished: true,
  isPinned: false,
  publishedAt: ''
});

const form = reactive<AnnouncementForm>(emptyForm());

const announcementSummary = computed(() => ({
  total: summary.total || meta.total || rows.value.length,
  publishedCount: summary.publishedCount || meta.total || rows.value.length,
  totalReadCount: summary.totalReadCount
}));
const filteredRows = computed(() => rows.value);

function assignForm(value: Partial<AnnouncementForm>) {
  Object.assign(form, emptyForm(), value);
}

async function loadRows() {
  loading.value = true;
  try {
    const params = new URLSearchParams({
      page: String(meta.page),
      pageSize: String(meta.pageSize)
    });
    const keyword = query.keyword.trim();
    if (keyword) params.set('keyword', keyword);
    const data = await api.get<AnnouncementAdminPayload>(`/admin/announcements?${params}`);
    rows.value = data.rows;
    Object.assign(meta, data.meta || { page: 1, pageSize: meta.pageSize, total: rows.value.length, pages: 1 });
    Object.assign(summary, data.summary || {
      total: meta.total,
      publishedCount: meta.total,
      totalReadCount: rows.value.reduce((sum, item) => sum + Number(item.readCount || 0), 0)
    });
    categoryOptions.value = Array.from(new Set([...categoryOptions.value, ...data.categoryOptions])).filter(Boolean);
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '公告列表加载失败');
  } finally {
    loading.value = false;
  }
}

function handleSearch() {
  if (searchTimer) window.clearTimeout(searchTimer);
  meta.page = 1;
  void loadRows();
}

function handleKeywordInput() {
  if (searchTimer) window.clearTimeout(searchTimer);
  searchTimer = window.setTimeout(handleSearch, 250);
}

function openCreate() {
  assignForm({});
  dialogVisible.value = true;
}

function openEdit(row: AnnouncementAdminRow) {
  assignForm({
    id: row.id,
    title: row.title,
    summary: row.summary,
    content: row.content.join('\n'),
    categoryLabel: row.categoryLabel || row.category,
    statusLabel: row.statusLabel,
    statusTone: row.statusTone,
    publisher: row.publisher,
    isPublished: true,
    isPinned: Boolean(row.isPinned || row.pinned),
    publishedAt: row.publishedAt || ''
  });
  dialogVisible.value = true;
}

function payloadFromForm() {
  return {
    title: form.title.trim(),
    summary: form.summary.trim(),
    content: form.content,
    categoryLabel: form.categoryLabel.trim(),
    statusLabel: form.statusLabel.trim(),
    statusTone: form.statusTone,
    publisher: form.publisher.trim() || 'QandA 管理员',
    isPublished: true,
    isPinned: Boolean(form.isPinned),
    publishedAt: form.publishedAt || ''
  };
}

async function save() {
  saving.value = true;
  try {
    const payload = payloadFromForm();
    if (form.id) await api.put(`/admin/announcements/${form.id}`, payload);
    else await api.post('/admin/announcements', payload);
    dialogVisible.value = false;
    ElMessage.success('公告已发布到答题端');
    await loadRows();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '保存失败');
  } finally {
    saving.value = false;
  }
}

async function togglePinned(row: AnnouncementAdminRow) {
  pinningId.value = row.id;
  try {
    const payload = {
      title: row.title,
      summary: row.summary,
      content: row.content,
      categoryLabel: row.categoryLabel || row.category || '公告',
      statusLabel: row.statusLabel || '已发布',
      statusTone: row.statusTone || 'success',
      publisher: row.publisher || 'QandA 管理员',
      isPublished: true,
      isPinned: !(row.isPinned || row.pinned),
      publishedAt: row.publishedAt || ''
    };
    await api.put(`/admin/announcements/${row.id}`, payload);
    ElMessage.success(payload.isPinned ? '公告已置顶' : '已取消置顶');
    await loadRows();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '置顶操作失败');
  } finally {
    pinningId.value = '';
  }
}

async function remove(id: string) {
  try {
    await ElMessageBox.confirm('删除后用户端将不再显示该公告，确认删除？', '删除公告', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消'
    });
    await api.delete(`/admin/announcements/${id}`);
    ElMessage.success('公告已删除');
    await loadRows();
  } catch (error) {
    if (error === 'cancel' || error === 'close') return;
    ElMessage.error(error instanceof Error ? error.message : '删除失败');
  }
}

onMounted(loadRows);

onBeforeUnmount(() => {
  if (searchTimer) window.clearTimeout(searchTimer);
});
</script>

<style scoped>
.announcement-admin-page {
  max-width: 1680px;
  margin: 0 auto;
}

.announcement-admin-hero {
  margin-bottom: 16px;
  border-radius: 6px;
  border: 1px solid #e5e7eb;
  background: linear-gradient(135deg, #fff 0%, #f7fbff 100%);
}

.announcement-admin-hero :deep(.el-card__body) {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  padding: 18px 20px;
}

.announcement-admin-hero h2 {
  margin: 0;
  font-size: 22px;
  line-height: 1.22;
  font-weight: 700;
  color: #111827;
}

.announcement-admin-hero p {
  margin: 8px 0 0;
  color: #64748b;
  font-size: 14px;
}

.announcement-admin-stats {
  display: grid;
  grid-template-columns: repeat(3, 118px);
  gap: 10px;
}

.announcement-admin-stats article {
  min-height: 76px;
  display: grid;
  align-content: center;
  gap: 5px;
  padding: 12px 14px;
  border: 1px solid #dbeafe;
  border-radius: 8px;
  background: #fff;
}

.announcement-admin-stats span {
  color: #64748b;
  font-size: 12px;
  font-weight: 600;
}

.announcement-admin-stats strong {
  color: #2563eb;
  font-size: 24px;
  line-height: 1;
}

.announcement-admin-toolbar {
  display: grid;
  grid-template-columns: minmax(240px, 1fr) auto;
  gap: 12px;
  margin-bottom: 16px;
}

.announcement-table :deep(.el-table__cell) {
  vertical-align: middle;
}

.announcement-read-count {
  color: #1d4ed8;
  font-size: 15px;
  font-weight: 700;
}

.announcement-admin-pager {
  margin-top: 16px;
  justify-content: flex-end;
}

.announcement-admin-mobile-list {
  display: none;
}

.announcement-form-inline {
  width: 100%;
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
}

.announcement-tag-presets {
  min-width: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.announcement-publish-note {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  min-height: 40px;
  padding: 11px 12px;
  border: 1px solid #e5edf7;
  border-radius: 10px;
  background: #f8fbff;
}

.announcement-publish-note span {
  color: #64748b;
  font-size: 13px;
  line-height: 1.55;
  font-weight: 500;
}

.announcement-form {
  display: grid;
  gap: 18px;
}

.announcement-form :deep(.el-form-item) {
  margin-bottom: 0;
}

.announcement-form :deep(.el-form-item__label) {
  margin-bottom: 8px;
  color: #334155;
  font-weight: 700;
}

.announcement-form-section {
  display: grid;
  gap: 14px;
  padding: 16px;
  border: 1px solid #e5edf7;
  border-radius: 12px;
  background: linear-gradient(180deg, #fff 0%, #fbfdff 100%);
}

.announcement-form-section-head {
  display: grid;
  gap: 4px;
  padding-bottom: 2px;
}

.announcement-form-section-head strong {
  color: #111827;
  font-size: 15px;
  line-height: 1.2;
}

.announcement-form-section-head span {
  color: #64748b;
  font-size: 12px;
  line-height: 1.45;
}

.announcement-form-grid,
.announcement-publish-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(240px, .75fr);
  gap: 16px;
  align-items: start;
}

.announcement-editor-dialog :deep(.el-dialog__body) {
  padding: 18px 24px 10px;
}

.announcement-editor-dialog :deep(.el-dialog__footer) {
  padding: 12px 24px 20px;
  border-top: 1px solid #edf2f7;
}

@media (max-width: 920px) {
  .announcement-admin-hero :deep(.el-card__body) {
    align-items: flex-start;
    flex-direction: column;
  }

  .announcement-admin-stats {
    width: 100%;
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .announcement-admin-toolbar {
    grid-template-columns: 1fr;
  }

  .announcement-table {
    display: none;
  }

  .announcement-admin-mobile-list {
    display: grid;
    gap: 12px;
  }

  .announcement-admin-mobile-list article {
    display: grid;
    gap: 10px;
    padding: 14px;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    background: #fff;
  }

  .announcement-admin-mobile-card-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 10px;
  }

  .announcement-admin-mobile-tags {
    display: inline-flex;
    align-items: center;
    justify-content: flex-end;
    flex-wrap: wrap;
    gap: 6px;
  }

  .announcement-admin-mobile-card-head strong {
    color: #111827;
    font-size: 15px;
    line-height: 1.35;
  }

  .announcement-admin-mobile-list p {
    margin: 0;
    color: #64748b;
    font-size: 13px;
    line-height: 1.55;
  }

  .announcement-admin-mobile-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 7px;
  }

  .announcement-admin-mobile-meta span {
    min-height: 24px;
    display: inline-flex;
    align-items: center;
    padding: 0 9px;
    border-radius: 999px;
    background: #f1f5f9;
    color: #475569;
    font-size: 12px;
    font-weight: 600;
  }

  .announcement-admin-mobile-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }
}

@media (max-width: 520px) {
  .announcement-admin-stats {
    grid-template-columns: 1fr;
  }

  .announcement-form-inline {
    grid-template-columns: 1fr;
  }

  .announcement-form-grid,
  .announcement-publish-grid {
    grid-template-columns: 1fr;
  }
}


/* 公告管理页滚动修正：列表区域按浏览器视口高度滚动，避免数据过多时撑高页面。 */
.announcement-admin-panel :deep(.el-card__body) {
  max-height: calc(100dvh - 236px);
  overflow-y: auto;
  overflow-x: hidden;
  overscroll-behavior: contain;
}

.announcement-table {
  min-height: 0;
}

.announcement-form {
  max-height: calc(100dvh - 260px);
  overflow-y: auto;
  overflow-x: hidden;
  padding-right: 10px;
  overscroll-behavior: contain;
}

@media (max-width: 920px) {
  .announcement-admin-panel :deep(.el-card__body) {
    max-height: calc(100dvh - 210px);
  }

  .announcement-admin-mobile-list {
    max-height: calc(100dvh - 288px);
    overflow-y: auto;
    overflow-x: hidden;
    overscroll-behavior: contain;
  }

  .announcement-form {
    max-height: calc(100dvh - 220px);
  }
}

</style>
