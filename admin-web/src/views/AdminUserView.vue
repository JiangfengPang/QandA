<template>
  <section>
    <div class="toolbar">
      <el-input v-model="keyword" placeholder="搜索管理员账号/QQ邮箱/昵称" clearable style="width:320px" @keyup.enter="load" />
      <el-button @click="load">搜索</el-button>
    </div>
    <el-card>
      <el-table :data="rows" stripe>
        <el-table-column prop="username" label="管理员账号" min-width="160" />
        <el-table-column prop="email" label="QQ 邮箱" min-width="190">
          <template #default="{row}">{{ row.email || '-' }}</template>
        </el-table-column>
        <el-table-column prop="nickname" label="昵称" min-width="150" />
        <el-table-column label="类型" width="120">
          <template #default>
            <el-tag type="danger">管理员</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="isActive" label="状态" width="100">
          <template #default="{row}"><el-switch v-model="row.isActive" @change="toggle(row)" /></template>
        </el-table-column>
        <el-table-column label="创建时间" min-width="190">
          <template #default="{row}">{{ formatDateTime(row.createdAt) }}</template>
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
import { ElPagination } from 'element-plus/es/components/pagination/index';
import { ElSwitch } from 'element-plus/es/components/switch/index';
import { ElTable, ElTableColumn } from 'element-plus/es/components/table/index';
import { ElTag } from 'element-plus/es/components/tag/index';
import { api } from '../api/request';
import { formatDateTime } from '../utils/date';

const rows = ref<any[]>([]);
const keyword = ref('');
const meta = reactive({ page: 1, pageSize: 20, total: 0 });

async function load() {
  const data = await api.get<any>(`/admin/admins?page=${meta.page}&pageSize=${meta.pageSize}&keyword=${encodeURIComponent(keyword.value)}`);
  rows.value = data.rows;
  Object.assign(meta, data.meta);
}

async function toggle(row: any) {
  await api.patch(`/admin/admins/${row.id}`, { isActive: row.isActive });
  ElMessage.success('已更新');
}

onMounted(load);
</script>
