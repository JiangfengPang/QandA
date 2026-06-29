<template>
  <section class="dashboard-page" v-loading="loading">
    <div class="dashboard-kpi-strip">
      <article v-for="item in kpiCards" :key="item.label" class="dashboard-kpi">
        <span>{{ item.label }}</span>
        <strong>{{ item.value }}</strong>
        <small>{{ item.hint }}</small>
      </article>
    </div>

    <div class="dashboard-chart-grid">
      <el-card class="dashboard-chart-card dashboard-type-card" shadow="never">
        <template #header>
          <div class="dashboard-card-head">
            <div class="dashboard-card-title">
              <strong>题型结构</strong>
              <span>当前题库中各题型占比</span>
            </div>
          </div>
        </template>
        <div ref="typeChartRef" class="dashboard-chart dashboard-type-chart" />
      </el-card>

      <el-card class="dashboard-insight-card" shadow="never">
        <template #header>
          <div class="dashboard-card-head">
            <div class="dashboard-card-title">
              <strong>题型数量</strong>
              <span>用于快速发现题型结构是否失衡</span>
            </div>
          </div>
        </template>
        <div class="dashboard-type-list">
          <div v-for="item in typeRows" :key="item.type || item.label">
            <span>{{ item.label }}</span>
            <strong>{{ formatNumber(item.count) }}</strong>
          </div>
        </div>
      </el-card>
    </div>

    <div class="dashboard-insight-grid">
      <el-card class="dashboard-insight-card" shadow="never">
        <template #header>
          <div class="dashboard-card-head">
            <div class="dashboard-card-title">
              <strong>内容建设效率</strong>
              <span>题库与题目规模的派生指标</span>
            </div>
          </div>
        </template>
        <div class="dashboard-derived-list">
          <div v-for="item in derivedMetrics" :key="item.label">
            <span>{{ item.label }}</span>
            <strong>{{ item.value }}</strong>
          </div>
        </div>
      </el-card>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { PieChart } from 'echarts/charts';
import { TooltipComponent } from 'echarts/components';
import { init, use, type ECharts } from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import { ElCard } from 'element-plus/es/components/card/index';
import { ElMessage } from 'element-plus/es/components/message/index';
import { api } from '../api/request';

use([PieChart, TooltipComponent, CanvasRenderer]);

type QuestionTypeCount = {
  type: string;
  label: string;
  count: number;
};

type DashboardStats = {
  userCount: number;
  subjectCount: number;
  bankCount: number;
  questionCount: number;
  answerCount: number;
  questionTypeCounts?: QuestionTypeCount[];
};

const emptyStats = (): DashboardStats => ({
  userCount: 0,
  subjectCount: 0,
  bankCount: 0,
  questionCount: 0,
  answerCount: 0,
  questionTypeCounts: []
});

const loading = ref(false);
const stats = ref<DashboardStats>(emptyStats());
const typeChartRef = ref<HTMLElement>();
let typeChart: ECharts | null = null;
const typeChartColors = ['#2563eb', '#14b8a6', '#f97316', '#8b5cf6', '#06b6d4', '#ef4444'];

const typeRows = computed(() => {
  const rows = stats.value.questionTypeCounts || [];
  return rows
    .map((item) => ({ ...item, count: Number(item.count || 0) }))
    .filter((item) => item.count > 0)
    .sort((left, right) => right.count - left.count);
});

const kpiCards = computed(() => [
  { label: '用户数', value: formatNumber(stats.value.userCount), hint: '含学生与管理员账号' },
  { label: '科目数', value: formatNumber(stats.value.subjectCount), hint: '已创建的科目分类' },
  { label: '题库数', value: formatNumber(stats.value.bankCount), hint: '按单元或专题组织' },
  { label: '题目数', value: formatNumber(stats.value.questionCount), hint: `${typeRows.value.length || 0} 种题型` },
  { label: '答题记录', value: formatNumber(stats.value.answerCount), hint: '累计提交答案，不参与规模图比较' }
]);

const derivedMetrics = computed(() => {
  const subjectCount = Math.max(Number(stats.value.subjectCount || 0), 1);
  const bankCount = Math.max(Number(stats.value.bankCount || 0), 1);
  const userCount = Math.max(Number(stats.value.userCount || 0), 1);
  return [
    { label: '平均每科题库', value: `${formatDecimal(stats.value.bankCount / subjectCount)} 个` },
    { label: '平均每题库题目', value: `${formatDecimal(stats.value.questionCount / bankCount)} 道` },
    { label: '人均答题记录', value: `${formatDecimal(stats.value.answerCount / userCount)} 次` },
    { label: '平均每题答题', value: `${formatDecimal(stats.value.answerCount / Math.max(Number(stats.value.questionCount || 0), 1))} 次` }
  ];
});

function formatNumber(value: number) {
  return new Intl.NumberFormat('zh-CN').format(Number(value || 0));
}

function formatDecimal(value: number) {
  if (!Number.isFinite(value)) return '0';
  return value >= 10 ? value.toFixed(1) : value.toFixed(2);
}

function renderTypeChart() {
  if (!typeChartRef.value) return;
  if (!typeChart) typeChart = init(typeChartRef.value);
  const rows = typeRows.value.length
    ? typeRows.value
    : [{ type: 'empty', label: '暂无题目', count: 1 }];
  typeChart.clear();
  typeChart.setOption({
    color: typeRows.value.length ? typeChartColors : ['#cbd5e1'],
    tooltip: {
      trigger: 'item',
      formatter: ({ name, value, percent }: { name: string; value: number; percent: number }) => (
        `${name}<br/>${formatNumber(value)} 题 · ${percent}%`
      )
    },
    series: [{
      name: '题型数量',
      type: 'pie',
      radius: ['38%', '58%'],
      center: ['50%', '50%'],
      avoidLabelOverlap: true,
      label: {
        show: true,
        position: 'outer',
        alignTo: 'edge',
        edgeDistance: 18,
        color: '#475569',
        lineHeight: 16,
        formatter: ({ name, value, percent }: { name: string; value: number; percent: number }) => (
          `${name}\n${formatNumber(value)} 题 · ${percent}%`
        )
      },
      labelLine: {
        show: true,
        length: 16,
        length2: 42,
        lineStyle: { color: '#cbd5e1' }
      },
      data: rows.map((item) => ({ name: item.label, value: item.count }))
    }]
  });
}

function renderCharts() {
  renderTypeChart();
}

async function load() {
  loading.value = true;
  try {
    stats.value = await api.get<DashboardStats>('/admin/dashboard');
    await nextTick();
    renderCharts();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '仪表盘数据加载失败');
  } finally {
    loading.value = false;
  }
}

function resizeCharts() {
  typeChart?.resize();
}

onMounted(() => {
  load();
  window.addEventListener('resize', resizeCharts);
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', resizeCharts);
  typeChart?.dispose();
  typeChart = null;
});
</script>

<style scoped>
.dashboard-page {
  max-width: 1680px;
  margin: 0 auto;
}

.dashboard-kpi-strip {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 14px;
  margin-bottom: 16px;
}

.dashboard-kpi,
.dashboard-chart-card,
.dashboard-insight-card {
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: #fff;
}

.dashboard-kpi {
  min-width: 0;
  padding: 15px 16px;
}

.dashboard-kpi span {
  display: block;
  color: #64748b;
  font-size: 13px;
  font-weight: 700;
}

.dashboard-kpi strong {
  display: block;
  margin-top: 7px;
  color: #1d4ed8;
  font-size: 27px;
  line-height: 1.05;
}

.dashboard-kpi small {
  display: block;
  margin-top: 8px;
  color: #94a3b8;
  font-size: 12px;
  line-height: 1.35;
}

.dashboard-chart-grid {
  display: grid;
  grid-template-columns: minmax(640px, 1.15fr) minmax(360px, .85fr);
  gap: 16px;
  margin-bottom: 16px;
}

.dashboard-chart-card :deep(.el-card__header),
.dashboard-insight-card :deep(.el-card__header) {
  padding: 15px 18px;
}

.dashboard-chart-card :deep(.el-card__body),
.dashboard-insight-card :deep(.el-card__body) {
  padding: 18px;
}

.dashboard-card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
  min-width: 0;
}

.dashboard-card-title {
  min-width: 0;
}

.dashboard-card-title strong {
  display: block;
  color: #172033;
  font-size: 16px;
  line-height: 1.3;
}

.dashboard-card-title span {
  display: block;
  margin-top: 4px;
  color: #94a3b8;
  font-size: 12px;
  line-height: 1.45;
}

.dashboard-chart {
  width: 100%;
  height: 380px;
}

.dashboard-type-chart {
  min-height: 380px;
}

.dashboard-insight-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 16px;
}

.dashboard-derived-list,
.dashboard-type-list {
  display: grid;
  gap: 10px;
}

.dashboard-derived-list {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.dashboard-derived-list div,
.dashboard-type-list div {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border: 1px solid #edf2f7;
  border-radius: 8px;
  background: #f8fafc;
}

.dashboard-derived-list div {
  display: block;
  padding: 14px;
}

.dashboard-type-list div {
  padding: 11px 13px;
}

.dashboard-derived-list span,
.dashboard-type-list span {
  color: #64748b;
  font-size: 13px;
  font-weight: 700;
}

.dashboard-derived-list strong,
.dashboard-type-list strong {
  color: #111827;
}

.dashboard-derived-list strong {
  display: block;
  margin-top: 8px;
  font-size: 23px;
}

.dashboard-type-list strong {
  flex: 0 0 auto;
  font-size: 18px;
}

@media (max-width: 1280px) {
  .dashboard-kpi-strip {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .dashboard-chart-grid {
    grid-template-columns: 1fr;
  }

  .dashboard-derived-list {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 720px) {
  .dashboard-kpi-strip,
  .dashboard-derived-list {
    grid-template-columns: 1fr;
  }

  .dashboard-card-head {
    flex-direction: column;
  }

  .dashboard-chart {
    height: 300px;
  }

  .dashboard-type-chart {
    height: 320px;
    min-height: 320px;
  }
}
</style>
