<template>
  <section>
    <el-row :gutter="16">
      <el-col v-for="item in cards" :key="item.label" :xs="24" :sm="12" :lg="6">
        <el-card class="stat-card"><span>{{ item.label }}</span><strong>{{ item.value }}</strong></el-card>
      </el-col>
    </el-row>
  </section>
</template>
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { ElCard } from 'element-plus/es/components/card/index';
import { ElCol } from 'element-plus/es/components/col/index';
import { ElRow } from 'element-plus/es/components/row/index';
import { api } from '../api/request';
const stats = ref<any>({});
const cards = computed(() => [
  { label: '用户数', value: stats.value.userCount || 0 },
  { label: '科目数', value: stats.value.subjectCount || 0 },
  { label: '题库数', value: stats.value.bankCount || 0 },
  { label: '题目数', value: stats.value.questionCount || 0 },
  { label: '答题记录', value: stats.value.answerCount || 0 }
]);
onMounted(async () => { stats.value = await api.get('/admin/dashboard'); });
</script>
