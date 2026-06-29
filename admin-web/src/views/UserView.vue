<template>
  <section class="admin-user-page" v-loading="loading">
    <div class="user-summary-grid">
      <article v-for="item in summaryCards" :key="item.label" class="user-summary-card">
        <span>{{ item.label }}</span>
        <strong>{{ item.value }}</strong>
        <small>{{ item.hint }}</small>
      </article>
    </div>

    <el-card class="user-filter-card" shadow="never">
      <div class="user-filter-row">
        <el-input
          v-model="filters.keyword"
          placeholder="搜索 QQ 邮箱/昵称"
          clearable
          class="user-search-input"
          @keyup.enter="applyFilters"
          @clear="applyFilters"
        />
        <el-select v-model="filters.status" class="user-filter-select" placeholder="账号状态" @change="applyFilters">
          <el-option label="全部状态" value="" />
          <el-option label="启用" value="active" />
          <el-option label="停用" value="inactive" />
        </el-select>
        <el-select v-model="filters.nicknameStatus" class="user-filter-select" placeholder="昵称状态" @change="applyFilters">
          <el-option label="全部昵称" value="" />
          <el-option label="正常昵称" value="normal" />
          <el-option label="不合规昵称" value="violation" />
        </el-select>
        <el-select v-model="filters.recentActive" class="user-filter-select" placeholder="最近活跃" @change="applyFilters">
          <el-option label="全部活跃" value="" />
          <el-option label="今日活跃" value="today" />
          <el-option label="近 7 天活跃" value="7d" />
          <el-option label="近 30 天活跃" value="30d" />
          <el-option label="30 天未活跃" value="inactive30" />
          <el-option label="从未活跃" value="never" />
        </el-select>
        <el-date-picker
          v-model="registeredRange"
          type="daterange"
          start-placeholder="注册开始"
          end-placeholder="注册结束"
          class="user-date-range"
          @change="applyFilters"
        />
        <el-button type="primary" @click="applyFilters">搜索</el-button>
        <el-button @click="resetFilters">重置</el-button>
      </div>

      <div class="user-batch-bar">
        <span>已选择 {{ selectedRows.length }} 个用户</span>
        <div>
          <el-button :disabled="!selectedRows.length" @click="runBatch('enable')">批量启用</el-button>
          <el-button :disabled="!selectedRows.length" @click="runBatch('disable')">批量停用</el-button>
          <el-button :disabled="!selectedRows.length" type="warning" plain @click="runBatch('resetNickname')">批量重置昵称</el-button>
        </div>
      </div>
    </el-card>

    <el-card class="user-table-card" shadow="never">
      <el-table
        ref="tableRef"
        :data="rows"
        stripe
        row-key="id"
        empty-text="暂无符合条件的答题用户"
        @selection-change="handleSelectionChange"
      >
        <el-table-column type="selection" width="42" align="center" />
        <el-table-column prop="email" label="QQ 邮箱" width="200" show-overflow-tooltip>
          <template #default="{ row }">
            <div class="email-cell">
              <button
                v-if="row.email"
                type="button"
                class="email-copy-target"
                :title="`点击复制 ${row.email}`"
                @click.stop="copyEmail(row.email)"
              >
                {{ row.email }}
              </button>
              <span v-else class="empty-email">-</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="昵称" width="160" show-overflow-tooltip>
          <template #default="{ row }">
            <span class="nickname-text">{{ row.nickname }}</span>
          </template>
        </el-table-column>
        <el-table-column label="昵称状态" width="95">
          <template #default="{ row }">
            <el-tag :type="row.nicknameViolation ? 'danger' : 'success'" size="small" :effect="row.nicknameViolation ? 'dark' : 'plain'">
              {{ row.nicknameViolation ? '不合规' : '正常' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="74">
          <template #default="{ row }">
            <el-switch :model-value="row.isActive" @change="toggle(row, Boolean($event))" />
          </template>
        </el-table-column>
        <el-table-column prop="answerCount" label="答题次数" width="92" sortable />
        <el-table-column label="正确率" min-width="220">
          <template #default="{ row }">
            <div class="accuracy-cell">
              <el-progress :percentage="row.accuracy" :stroke-width="7" :show-text="false" />
              <span>{{ row.accuracy }}%</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="wrongCount" label="错题" width="68" sortable />
        <el-table-column prop="favoriteCount" label="收藏" width="68" sortable />
        <el-table-column label="最近活跃" width="118" sortable>
          <template #default="{ row }">{{ relativeTime(row.lastActiveAt) }}</template>
        </el-table-column>
        <el-table-column label="注册时间" width="185" sortable>
          <template #default="{ row }">{{ formatDateTime(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="184">
          <template #default="{ row }">
            <div class="user-action-cell">
              <el-button link type="primary" @click="openDetail(row)">查看详情</el-button>
              <el-button link :type="row.nicknameViolation ? 'danger' : 'primary'" @click="resetNickname(row)">重置昵称</el-button>
            </div>
          </template>
        </el-table-column>
      </el-table>
      <el-pagination
        class="pager"
        layout="sizes, prev, pager, next, total"
        :page-sizes="[10, 20, 50, 100]"
        :total="meta.total"
        v-model:page-size="meta.pageSize"
        v-model:current-page="meta.page"
        @size-change="handlePageSizeChange"
        @current-change="load"
      />
    </el-card>

    <el-drawer v-model="detailVisible" size="560px" title="用户详情" class="user-detail-drawer">
      <div v-loading="detailLoading" class="user-detail-body">
        <template v-if="detail">
          <el-descriptions :column="1" border>
            <el-descriptions-item label="QQ 邮箱">{{ detail.user.email || '-' }}</el-descriptions-item>
            <el-descriptions-item label="昵称">
              {{ detail.user.nickname }}
              <el-tag v-if="detail.user.nicknameViolation" type="danger" size="small" effect="dark">不合规</el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="账号状态">{{ detail.user.isActive ? '启用' : '停用' }}</el-descriptions-item>
            <el-descriptions-item label="最近活跃">{{ formatDateTime(detail.user.lastActiveAt) }}</el-descriptions-item>
            <el-descriptions-item label="注册时间">{{ formatDateTime(detail.user.createdAt) }}</el-descriptions-item>
          </el-descriptions>

          <div class="detail-metric-grid">
            <article>
              <span>答题次数</span>
              <strong>{{ detail.stats.answerCount }}</strong>
            </article>
            <article>
              <span>正确率</span>
              <strong>{{ detail.stats.accuracy }}%</strong>
            </article>
            <article>
              <span>错题数</span>
              <strong>{{ detail.stats.wrongCount }}</strong>
            </article>
            <article>
              <span>练习时长</span>
              <strong>{{ formatDuration(detail.stats.durationSeconds) }}</strong>
            </article>
          </div>

          <h3 class="detail-section-title">最近答题记录</h3>
          <el-table :data="detail.recentAnswers" size="small" empty-text="暂无答题记录">
            <el-table-column label="题目" min-width="210" show-overflow-tooltip>
              <template #default="{ row }">
                <div class="recent-answer-title">
                  <strong>{{ row.subjectName }} / {{ row.bankName }}</strong>
                  <span>{{ row.questionStem }}</span>
                </div>
              </template>
            </el-table-column>
            <el-table-column label="结果" width="78">
              <template #default="{ row }">
                <el-tag :type="row.isCorrect ? 'success' : 'danger'" size="small">{{ row.isCorrect ? '正确' : '错误' }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="时间" width="138">
              <template #default="{ row }">{{ formatDateTime(row.createdAt) }}</template>
            </el-table-column>
          </el-table>
        </template>
      </div>
    </el-drawer>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { ElButton } from 'element-plus/es/components/button/index';
import { ElCard } from 'element-plus/es/components/card/index';
import { ElDatePicker } from 'element-plus/es/components/date-picker/index';
import { ElDescriptions, ElDescriptionsItem } from 'element-plus/es/components/descriptions/index';
import { ElDrawer } from 'element-plus/es/components/drawer/index';
import { ElInput } from 'element-plus/es/components/input/index';
import { ElMessage } from 'element-plus/es/components/message/index';
import { ElMessageBox } from 'element-plus/es/components/message-box/index';
import { ElPagination } from 'element-plus/es/components/pagination/index';
import { ElProgress } from 'element-plus/es/components/progress/index';
import { ElOption, ElSelect } from 'element-plus/es/components/select/index';
import { ElSwitch } from 'element-plus/es/components/switch/index';
import { ElTable, ElTableColumn } from 'element-plus/es/components/table/index';
import { ElTag } from 'element-plus/es/components/tag/index';
import { api } from '../api/request';
import { formatDateTime } from '../utils/date';

type UserRow = {
  id: string;
  email: string;
  nickname: string;
  role: string;
  isActive: boolean;
  createdAt: string;
  lastActiveAt?: string | null;
  nicknameViolation?: boolean;
  answerCount: number;
  correctCount: number;
  accuracy: number;
  wrongCount: number;
  favoriteCount: number;
  durationSeconds: number;
  lastAnsweredAt?: string | null;
};

type UserSummary = {
  total: number;
  activeCount: number;
  inactiveCount: number;
  nicknameViolationCount: number;
  activeToday: number;
  activeSevenDays: number;
  inactiveThirtyDays: number;
};

type UserDetail = {
  user: UserRow;
  stats: {
    answerCount: number;
    correctCount: number;
    accuracy: number;
    wrongCount: number;
    favoriteCount: number;
    durationSeconds: number;
    lastAnsweredAt?: string | null;
  };
  recentAnswers: Array<{
    id: string;
    subjectName: string;
    bankName: string;
    questionStem: string;
    isCorrect: boolean;
    durationSeconds: number;
    createdAt: string;
  }>;
};

const rows = ref<UserRow[]>([]);
const selectedRows = ref<UserRow[]>([]);
const loading = ref(false);
const detailLoading = ref(false);
const detailVisible = ref(false);
const detail = ref<UserDetail | null>(null);
const registeredRange = ref<[Date, Date] | null>(null);
const tableRef = ref();
const meta = reactive({ page: 1, pageSize: 20, total: 0 });
const filters = reactive({
  keyword: '',
  status: '',
  nicknameStatus: '',
  recentActive: ''
});
const summary = ref<UserSummary>({
  total: 0,
  activeCount: 0,
  inactiveCount: 0,
  nicknameViolationCount: 0,
  activeToday: 0,
  activeSevenDays: 0,
  inactiveThirtyDays: 0
});

const summaryCards = computed(() => [
  { label: '筛选用户', value: summary.value.total, hint: '当前条件下的用户数' },
  { label: '启用用户', value: summary.value.activeCount, hint: `${summary.value.inactiveCount} 个已停用` },
  { label: '今日活跃', value: summary.value.activeToday, hint: `近 7 天 ${summary.value.activeSevenDays} 人` },
  { label: '不合规昵称', value: summary.value.nicknameViolationCount, hint: '需要人工处理' },
  { label: '沉默用户', value: summary.value.inactiveThirtyDays, hint: '30 天未活跃或从未活跃' }
]);

function buildQuery() {
  const qs = new URLSearchParams({
    page: String(meta.page),
    pageSize: String(meta.pageSize)
  });
  if (filters.keyword.trim()) qs.set('keyword', filters.keyword.trim());
  if (filters.status) qs.set('status', filters.status);
  if (filters.nicknameStatus) qs.set('nicknameStatus', filters.nicknameStatus);
  if (filters.recentActive) qs.set('recentActive', filters.recentActive);
  if (registeredRange.value?.[0]) qs.set('registeredStartAt', startOfDay(registeredRange.value[0]).toISOString());
  if (registeredRange.value?.[1]) qs.set('registeredEndAt', endOfDay(registeredRange.value[1]).toISOString());
  return qs;
}

function startOfDay(value: Date) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function endOfDay(value: Date) {
  const date = new Date(value);
  date.setHours(23, 59, 59, 999);
  return date;
}

async function load() {
  loading.value = true;
  try {
    const data = await api.get<any>(`/admin/users?${buildQuery()}`);
    rows.value = data.rows;
    summary.value = data.summary;
    Object.assign(meta, data.meta);
    selectedRows.value = [];
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '用户列表加载失败');
  } finally {
    loading.value = false;
  }
}

function applyFilters() {
  meta.page = 1;
  load();
}

function resetFilters() {
  filters.keyword = '';
  filters.status = '';
  filters.nicknameStatus = '';
  filters.recentActive = '';
  registeredRange.value = null;
  applyFilters();
}

function handlePageSizeChange() {
  meta.page = 1;
  load();
}

function handleSelectionChange(selection: any[]) {
  selectedRows.value = selection as UserRow[];
}

async function toggle(row: any, nextActive: boolean) {
  const user = row as UserRow;
  try {
    if (!nextActive) {
      await ElMessageBox.confirm(`确认停用“${user.nickname}”？停用后该账号将不能继续使用答题端。`, '停用用户');
    }
    const updated = await api.patch<UserRow>(`/admin/users/${user.id}`, { isActive: nextActive });
    Object.assign(user, updated);
    ElMessage.success(nextActive ? '用户已启用' : '用户已停用');
    load();
  } catch (error) {
    if (error === 'cancel' || error === 'close') return;
    ElMessage.error(error instanceof Error ? error.message : '状态更新失败');
  }
}

async function resetNickname(row: any) {
  const user = row as UserRow;
  const nickname = `用户${user.id.slice(-6)}`;
  try {
    await ElMessageBox.confirm(`确认将“${user.nickname}”重置为“${nickname}”？`, '重置昵称');
    const updated = await api.patch<UserRow>(`/admin/users/${user.id}`, { nickname });
    Object.assign(user, updated);
    ElMessage.success('昵称已重置');
    load();
  } catch (error) {
    if (error === 'cancel' || error === 'close') return;
    ElMessage.error(error instanceof Error ? error.message : '重置失败');
  }
}

async function runBatch(action: 'enable' | 'disable' | 'resetNickname') {
  if (!selectedRows.value.length) return;
  const labels = {
    enable: '批量启用',
    disable: '批量停用',
    resetNickname: '批量重置昵称'
  };
  try {
    await ElMessageBox.confirm(`确认${labels[action]} ${selectedRows.value.length} 个用户？`, labels[action]);
    await api.patch('/admin/users/batch', {
      ids: selectedRows.value.map((row) => row.id),
      action
    });
    ElMessage.success('批量操作已完成');
    load();
  } catch (error) {
    if (error === 'cancel' || error === 'close') return;
    ElMessage.error(error instanceof Error ? error.message : '批量操作失败');
  }
}

async function openDetail(row: any) {
  const user = row as UserRow;
  detailVisible.value = true;
  detailLoading.value = true;
  detail.value = null;
  try {
    detail.value = await api.get<UserDetail>(`/admin/users/${user.id}`);
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '详情加载失败');
  } finally {
    detailLoading.value = false;
  }
}

async function copyEmail(email: string) {
  try {
    await navigator.clipboard.writeText(email);
    ElMessage.success('邮箱已复制');
  } catch {
    ElMessage.warning('复制失败');
  }
}

function relativeTime(value?: string | null) {
  if (!value) return '从未活跃';
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return '-';
  const seconds = Math.max(0, Math.round((Date.now() - time) / 1000));
  if (seconds < 60) return '刚刚';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} 分钟前`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} 小时前`;
  return `${Math.floor(seconds / 86400)} 天前`;
}

function formatDuration(seconds: number) {
  const value = Math.max(0, Number(seconds || 0));
  if (value < 60) return `${value} 秒`;
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  if (hours) return `${hours} 小时 ${minutes} 分`;
  return `${minutes} 分钟`;
}

onMounted(load);
</script>

<style scoped>
.admin-user-page {
  width: 100%;
  max-width: none;
  margin: 0;
}

.user-summary-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 14px;
  margin-bottom: 14px;
}

.user-summary-card,
.user-filter-card,
.user-table-card {
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: #fff;
}

.user-summary-card {
  min-width: 0;
  padding: 15px 16px;
}

.user-summary-card span,
.user-summary-card small {
  display: block;
}

.user-summary-card span {
  color: #64748b;
  font-size: 13px;
  font-weight: 700;
}

.user-summary-card strong {
  display: block;
  margin-top: 7px;
  color: #1d4ed8;
  font-size: 27px;
  line-height: 1.05;
}

.user-summary-card small {
  margin-top: 8px;
  color: #94a3b8;
  font-size: 12px;
}

.user-filter-card {
  margin-bottom: 14px;
}

.user-filter-card :deep(.el-card__body) {
  padding: 14px;
}

.user-filter-row {
  display: grid;
  grid-template-columns: 260px 132px 132px 132px 350px auto auto 1fr;
  gap: 10px;
  align-items: center;
}

.user-search-input {
  width: 100%;
}

.user-filter-select {
  width: 100%;
}

.user-date-range {
  width: 350px;
  max-width: 100%;
}

.user-batch-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid #eef2f7;
}

.user-batch-bar > span {
  color: #64748b;
  font-size: 13px;
  font-weight: 700;
}

.user-table-card :deep(.el-card__body) {
  padding: 14px 16px;
}

.user-table-card :deep(.el-table__cell) {
  vertical-align: middle;
}

.user-table-card :deep(.el-table th.el-table__cell > .cell) {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  padding-right: 12px;
  padding-left: 12px;
  line-height: 20px;
  white-space: nowrap;
}

.user-table-card :deep(.el-table th.el-table__cell .caret-wrapper) {
  display: inline-flex;
  flex: 0 0 12px;
  align-items: center;
  justify-content: center;
  width: 12px;
  height: 18px;
  margin-left: 0;
  vertical-align: middle;
}

.email-cell {
  display: flex;
  width: 100%;
  min-width: 0;
  align-items: center;
}

.email-copy-target,
.empty-email,
.nickname-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.email-copy-target {
  max-width: 100%;
  padding: 0;
  border: 0;
  background: transparent;
  color: #475569;
  cursor: pointer;
  font: inherit;
  line-height: 22px;
  text-align: left;
}

.email-copy-target:hover,
.email-copy-target:focus-visible {
  color: #2563eb;
  text-decoration: underline;
  text-underline-offset: 3px;
}

.email-copy-target:focus-visible {
  outline: 2px solid rgba(37, 99, 235, .28);
  outline-offset: 2px;
  border-radius: 4px;
}

.empty-email {
  color: #94a3b8;
}

.nickname-text {
  display: inline-block;
  max-width: 100%;
}

.user-action-cell {
  display: flex;
  min-width: 0;
  justify-content: flex-start;
  gap: 10px;
  white-space: nowrap;
}

.user-action-cell :deep(.el-button) {
  min-height: 22px;
  padding: 0;
  font-weight: 600;
}

.accuracy-cell {
  display: grid;
  grid-template-columns: minmax(54px, 1fr) 40px;
  gap: 8px;
  align-items: center;
}

.accuracy-cell span {
  color: #475569;
  text-align: left;
}

.pager {
  display: flex;
  justify-content: flex-end;
  margin-top: 14px;
}

.user-detail-body {
  min-height: 260px;
}

.detail-metric-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
  margin: 16px 0;
}

.detail-metric-grid article {
  min-width: 0;
  padding: 12px;
  border: 1px solid #e8eef7;
  border-radius: 8px;
  background: #f8fafc;
}

.detail-metric-grid span {
  display: block;
  color: #64748b;
  font-size: 12px;
  font-weight: 700;
}

.detail-metric-grid strong {
  display: block;
  margin-top: 6px;
  color: #111827;
  font-size: 20px;
}

.detail-section-title {
  margin: 18px 0 10px;
  color: #172033;
  font-size: 15px;
}

.recent-answer-title {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.recent-answer-title strong,
.recent-answer-title span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.recent-answer-title strong {
  color: #475569;
  font-size: 12px;
}

.recent-answer-title span {
  color: #111827;
}

@media (max-width: 1280px) {
  .user-summary-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .user-filter-row {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .user-date-range {
    width: 100%;
  }
}

@media (max-width: 760px) {
  .user-summary-grid,
  .detail-metric-grid {
    grid-template-columns: 1fr;
  }

  .user-filter-row {
    grid-template-columns: 1fr;
  }

  .user-search-input,
  .user-filter-select,
  .user-date-range {
    width: 100%;
  }

  .user-batch-bar {
    align-items: stretch;
    flex-direction: column;
  }
}
</style>
