<template>
  <section class="audit-page">
    <el-card class="audit-toolbar-card" shadow="never">
      <div class="audit-intro">
        <div>
          <h2>管理员操作日志</h2>
          <p>记录后台账号的登录、账号管理、题库维护、导入和安全设置操作。</p>
        </div>
        <el-button :icon="Refresh" @click="load">刷新</el-button>
      </div>

      <div class="audit-filters">
        <el-input
          v-model="keyword"
          clearable
          placeholder="搜索管理员、操作内容、目标 ID"
          style="width: 260px"
          @keyup.enter="search"
          @clear="search"
        />
        <el-select v-model="action" clearable placeholder="全部操作类型" style="width: 160px" @change="search">
          <el-option v-for="item in actionOptions" :key="item.value" :value="item.value" :label="item.label" />
        </el-select>
        <el-date-picker
          v-model="dateRange"
          type="daterange"
          range-separator="至"
          start-placeholder="开始日期"
          end-placeholder="结束日期"
          style="width: 300px"
          @change="search"
        />
        <el-button type="primary" :icon="Search" @click="search">查询</el-button>
        <el-button @click="resetFilters">重置</el-button>
      </div>
    </el-card>

    <el-card class="audit-table-card" shadow="never">
      <el-table v-loading="loading" :data="rows" stripe empty-text="暂无操作日志">
        <el-table-column label="时间" width="176">
          <template #default="{ row }">{{ formatDateTime(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="管理员" min-width="150">
          <template #default="{ row }">
            <div class="admin-cell">
              <strong>{{ row.admin.nickname }}</strong>
              <span>{{ row.admin.username }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="操作类型" width="142">
          <template #default="{ row }">
            <el-tag :type="actionTagType(row.action)" effect="light">{{ actionLabel(row.action) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="summary" label="操作内容" min-width="220" show-overflow-tooltip />
        <el-table-column label="请求" min-width="210">
          <template #default="{ row }">
            <div class="request-cell">
              <el-tag size="small" effect="plain">{{ row.method }}</el-tag>
              <el-tooltip :content="row.path" placement="top">
                <span>{{ row.path }}</span>
              </el-tooltip>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="目标" min-width="150">
          <template #default="{ row }">
            <span v-if="row.targetId" class="target-id">{{ row.targetType || '资源' }} · {{ row.targetId }}</span>
            <span v-else class="muted">-</span>
          </template>
        </el-table-column>
        <el-table-column prop="ipAddress" label="IP 地址" width="132">
          <template #default="{ row }">{{ row.ipAddress || '-' }}</template>
        </el-table-column>
        <el-table-column label="结果" width="92" align="center">
          <template #default="{ row }">
            <el-tag :type="row.statusCode < 400 ? 'success' : 'danger'" effect="plain">
              {{ row.statusCode < 400 ? '成功' : '失败' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="耗时" width="88" align="right">
          <template #default="{ row }">{{ row.durationMs }} ms</template>
        </el-table-column>
      </el-table>

      <el-pagination
        class="pager"
        layout="prev, pager, next, sizes, total"
        :page-sizes="[20, 50, 100]"
        :total="meta.total"
        v-model:current-page="meta.page"
        v-model:page-size="meta.pageSize"
        @current-change="load"
        @size-change="changePageSize"
      />
    </el-card>
  </section>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { Refresh, Search } from '@element-plus/icons-vue';
import { ElButton } from 'element-plus/es/components/button/index';
import { ElCard } from 'element-plus/es/components/card/index';
import { ElDatePicker } from 'element-plus/es/components/date-picker/index';
import { ElInput } from 'element-plus/es/components/input/index';
import { ElMessage } from 'element-plus/es/components/message/index';
import { ElPagination } from 'element-plus/es/components/pagination/index';
import { ElOption, ElSelect } from 'element-plus/es/components/select/index';
import { ElTable, ElTableColumn } from 'element-plus/es/components/table/index';
import { ElTag } from 'element-plus/es/components/tag/index';
import { ElTooltip } from 'element-plus/es/components/tooltip/index';
import { api } from '../api/request';
import { formatDateTime } from '../utils/date';

type AuditRow = {
  id: string;
  action: string;
  summary: string;
  method: string;
  path: string;
  targetType?: string;
  targetId?: string;
  ipAddress?: string;
  statusCode: number;
  durationMs: number;
  createdAt: string;
  admin: { id: string; username: string; nickname: string };
};

const loading = ref(false);
const rows = ref<AuditRow[]>([]);
const keyword = ref('');
const action = ref('');
const dateRange = ref<[Date, Date] | null>(null);
const actionOptions = ref<Array<{ value: string; label: string }>>([]);
const meta = reactive({ page: 1, pageSize: 20, total: 0 });

function actionLabel(value: string) {
  return actionOptions.value.find((item) => item.value === value)?.label || value;
}

function actionTagType(value: string) {
  if (value.startsWith('DELETE')) return 'danger';
  if (value === 'LOGIN' || value.startsWith('CREATE') || value === 'IMPORT_QUESTIONS') return 'success';
  if (value === 'CHANGE_PASSWORD' || value === 'UPDATE_ADMIN') return 'warning';
  return 'info';
}

function buildQuery() {
  const params = new URLSearchParams({
    page: String(meta.page),
    pageSize: String(meta.pageSize)
  });
  if (keyword.value.trim()) params.set('keyword', keyword.value.trim());
  if (action.value) params.set('action', action.value);
  if (dateRange.value) {
    const start = new Date(dateRange.value[0]);
    const end = new Date(dateRange.value[1]);
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
    params.set('startAt', start.toISOString());
    params.set('endAt', end.toISOString());
  }
  return params.toString();
}

async function load() {
  loading.value = true;
  try {
    const data = await api.get<{
      rows: AuditRow[];
      actionOptions: Array<{ value: string; label: string }>;
      meta: typeof meta;
    }>(`/admin/audit-logs?${buildQuery()}`);
    rows.value = data.rows;
    actionOptions.value = data.actionOptions;
    Object.assign(meta, data.meta);
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '操作日志加载失败');
  } finally {
    loading.value = false;
  }
}

function search() {
  meta.page = 1;
  load();
}

function resetFilters() {
  keyword.value = '';
  action.value = '';
  dateRange.value = null;
  search();
}

function changePageSize() {
  meta.page = 1;
  load();
}

onMounted(load);
</script>

<style scoped>
.audit-page {
  max-width: 1680px;
  margin: 0 auto;
}

.audit-toolbar-card,
.audit-table-card {
  border: 1px solid #e4eaf2;
  border-radius: 10px;
}

.audit-toolbar-card {
  margin-bottom: 16px;
  background: linear-gradient(135deg, #ffffff 0%, #f7faff 100%);
}

.audit-intro {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
}

.audit-intro h2 {
  margin: 0;
  color: #111827;
  font-size: 22px;
}

.audit-intro p {
  margin: 7px 0 0;
  color: #64748b;
}

.audit-filters {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  margin-top: 18px;
  padding-top: 18px;
  border-top: 1px solid #e9eef6;
}

.audit-table-card :deep(.el-card__body) {
  padding: 0 0 18px;
}

.admin-cell strong,
.admin-cell span {
  display: block;
}

.admin-cell strong {
  color: #1f2937;
}

.admin-cell span {
  margin-top: 3px;
  color: #94a3b8;
  font-size: 12px;
}

.request-cell {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.request-cell > span {
  overflow: hidden;
  color: #64748b;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.target-id {
  display: block;
  overflow: hidden;
  color: #475569;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pager {
  padding: 0 18px;
}
</style>
