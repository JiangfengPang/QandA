<template>
  <section>
    <div class="toolbar">
      <el-input v-model="keyword" placeholder="搜索 QQ 邮箱/昵称" clearable style="width:260px" @keyup.enter="load" />
      <el-button @click="load">搜索</el-button>
    </div>
    <el-card>
      <el-table :data="rows" stripe>
        <el-table-column prop="email" label="QQ 邮箱" min-width="190" />
        <el-table-column label="昵称" min-width="190">
          <template #default="{row}">
            <div class="nickname-cell">
              <span>{{ row.nickname }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="昵称状态" width="120">
          <template #default="{row}">
            <el-tag :type="row.nicknameViolation ? 'danger' : 'success'" size="small" :effect="row.nicknameViolation ? 'dark' : 'plain'">
              {{ row.nicknameViolation ? '疑似违规' : '正常' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="类型" width="120">
          <template #default>
            <el-tag type="success">答题用户</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="isActive" label="状态" width="100">
          <template #default="{row}"><el-switch v-model="row.isActive" @change="toggle(row)" /></template>
        </el-table-column>
        <el-table-column label="注册时间" min-width="190">
          <template #default="{row}">{{ formatDateTime(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="120">
          <template #default="{row}">
            <el-button link :type="row.nicknameViolation ? 'danger' : 'primary'" @click="resetNickname(row)">重置昵称</el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-pagination class="pager" layout="prev, pager, next, total" :total="meta.total" :page-size="meta.pageSize" v-model:current-page="meta.page" @current-change="load" />
    </el-card>
  </section>
</template>
<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { ElButton } from 'element-plus/es/components/button/index';
import { ElCard } from 'element-plus/es/components/card/index';
import { ElInput } from 'element-plus/es/components/input/index';
import { ElMessage } from 'element-plus/es/components/message/index';
import { ElMessageBox } from 'element-plus/es/components/message-box/index';
import { ElPagination } from 'element-plus/es/components/pagination/index';
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
  nicknameViolation?: boolean;
};

const rows = ref<UserRow[]>([]);
const keyword = ref('');
const meta = reactive({ page: 1, pageSize: 20, total: 0 });

async function load() {
  const data = await api.get<any>(`/admin/users?page=${meta.page}&pageSize=${meta.pageSize}&keyword=${encodeURIComponent(keyword.value)}`);
  rows.value = data.rows;
  Object.assign(meta, data.meta);
}

async function toggle(row: any) {
  await api.patch(`/admin/users/${row.id}`, { isActive: row.isActive });
  ElMessage.success('已更新');
}

async function resetNickname(row: any) {
  const nickname = `用户${row.id.slice(-6)}`;
  try {
    await ElMessageBox.confirm(`确认将该用户昵称重置为“${nickname}”？`, '重置昵称');
    const updated = await api.patch<UserRow>(`/admin/users/${row.id}`, { nickname });
    Object.assign(row, updated);
    ElMessage.success('昵称已重置');
  } catch (error) {
    if (error === 'cancel' || error === 'close') return;
    ElMessage.error(error instanceof Error ? error.message : '重置失败');
  }
}

onMounted(load);
</script>

<style scoped>
.nickname-cell {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.nickname-cell span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
