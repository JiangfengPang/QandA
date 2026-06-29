<template>
  <section class="activity-page" v-loading="loading">
    <el-card class="activity-hero" shadow="never">
      <div>
        <div class="activity-kicker">用户实时状态</div>
        <h2>在线用户与答题活跃度</h2>
        <p>当前在线指最近 {{ onlineWindowLabel }}内持续发送心跳的学生端账号，答题活跃指标来自真实答题记录。</p>
      </div>
      <div class="hero-actions">
        <el-select v-model="days" style="width: 128px" @change="load">
          <el-option :value="7" label="近 7 天" />
          <el-option :value="14" label="近 14 天" />
          <el-option :value="30" label="近 30 天" />
        </el-select>
        <el-button type="primary" :icon="Refresh" @click="load">刷新数据</el-button>
      </div>
    </el-card>

    <div class="metric-grid">
      <el-card v-for="item in metrics" :key="item.label" class="metric-card" shadow="never">
        <div class="metric-top">
          <span>{{ item.label }}</span>
          <el-icon :class="['metric-icon', item.tone]"><component :is="item.icon" /></el-icon>
        </div>
        <strong>{{ item.value }}</strong>
        <small>{{ item.hint }}</small>
      </el-card>
    </div>

    <div class="activity-grid">
      <el-card class="content-card trend-card" shadow="never">
        <template #header>
          <div class="card-heading">
            <div>
              <strong>答题趋势</strong>
              <span>每日答题次数与活跃用户数</span>
            </div>
            <el-tag effect="plain">{{ days }} 天</el-tag>
          </div>
        </template>
        <div ref="chartRef" class="activity-chart" />
      </el-card>

      <el-card class="content-card online-card" shadow="never">
        <template #header>
          <div class="card-heading">
            <div>
              <strong>当前在线</strong>
              <span>共 {{ data.summary.onlineCount || 0 }} 人</span>
            </div>
            <span class="online-indicator"><i />实时</span>
          </div>
        </template>
        <el-table :data="data.onlineUsers" height="322" empty-text="当前暂无在线用户">
          <el-table-column prop="nickname" label="用户" min-width="110" show-overflow-tooltip />
          <el-table-column prop="email" label="QQ 邮箱" min-width="155" show-overflow-tooltip>
            <template #default="{ row }">{{ row.email || '-' }}</template>
          </el-table-column>
          <el-table-column label="最后心跳" width="86" align="right">
            <template #default="{ row }">{{ relativeTime(row.lastSeenAt) }}</template>
          </el-table-column>
        </el-table>
      </el-card>
    </div>

    <el-card class="content-card ranking-card" shadow="never">
      <template #header>
        <div class="card-heading">
          <div>
            <strong>近 7 天活跃用户排行</strong>
            <span>按答题次数排序，帮助识别高活跃学习用户</span>
          </div>
        </div>
      </template>
      <el-table :data="data.topActiveUsers" stripe empty-text="近 7 天暂无答题记录">
        <el-table-column type="index" label="排名" width="72" align="center" />
        <el-table-column prop="nickname" label="昵称" min-width="140" />
        <el-table-column prop="email" label="QQ 邮箱" min-width="190">
          <template #default="{ row }">{{ row.email || '-' }}</template>
        </el-table-column>
        <el-table-column prop="answerCount" label="答题次数" width="110" align="right" />
        <el-table-column label="正确率" min-width="190">
          <template #default="{ row }">
            <div class="accuracy-cell">
              <el-progress :percentage="row.accuracy" :stroke-width="8" :show-text="false" />
              <span>{{ row.accuracy }}%</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="答题时长" width="120" align="right">
          <template #default="{ row }">{{ formatDuration(row.durationSeconds) }}</template>
        </el-table-column>
      </el-table>
    </el-card>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { BarChart, LineChart } from 'echarts/charts';
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components';
import { init, use, type ECharts } from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import { Clock, DataAnalysis, Refresh, Select, Timer, User, UserFilled } from '@element-plus/icons-vue';
import { ElButton } from 'element-plus/es/components/button/index';
import { ElCard } from 'element-plus/es/components/card/index';
import { ElIcon } from 'element-plus/es/components/icon/index';
import { ElMessage } from 'element-plus/es/components/message/index';
import { ElProgress } from 'element-plus/es/components/progress/index';
import { ElOption, ElSelect } from 'element-plus/es/components/select/index';
import { ElTable, ElTableColumn } from 'element-plus/es/components/table/index';
import { ElTag } from 'element-plus/es/components/tag/index';
import { api } from '../api/request';

use([BarChart, LineChart, GridComponent, LegendComponent, TooltipComponent, CanvasRenderer]);

type ActivityData = {
  onlineWindowMinutes: number;
  onlineWindowSeconds?: number;
  checkedAt: string;
  summary: {
    totalStudents: number;
    onlineCount: number;
    activeToday: number;
    activeSevenDays: number;
    answersToday: number;
    answersSevenDays: number;
    accuracySevenDays: number;
    durationSevenDays: number;
  };
  onlineUsers: Array<{ id: string; nickname: string; email: string; lastSeenAt: string }>;
  trend: Array<{ date: string; label: string; answerCount: number; activeUserCount: number; accuracy: number }>;
  topActiveUsers: Array<{
    id: string;
    nickname: string;
    email: string;
    answerCount: number;
    accuracy: number;
    durationSeconds: number;
  }>;
};

const emptyData = (): ActivityData => ({
  onlineWindowMinutes: 1.5,
  onlineWindowSeconds: 90,
  checkedAt: '',
  summary: {
    totalStudents: 0,
    onlineCount: 0,
    activeToday: 0,
    activeSevenDays: 0,
    answersToday: 0,
    answersSevenDays: 0,
    accuracySevenDays: 0,
    durationSevenDays: 0
  },
  onlineUsers: [],
  trend: [],
  topActiveUsers: []
});

const loading = ref(false);
const days = ref(14);
const data = ref<ActivityData>(emptyData());
const chartRef = ref<HTMLElement>();
let chart: ECharts | null = null;

const metrics = computed(() => [
  { label: '当前在线', value: data.value.summary.onlineCount, hint: `共 ${data.value.summary.totalStudents} 个有效账号`, icon: UserFilled, tone: 'blue' },
  { label: '今日活跃', value: data.value.summary.activeToday, hint: '今日有答题记录的用户', icon: User, tone: 'cyan' },
  { label: '今日答题', value: data.value.summary.answersToday, hint: '今日提交的答案总数', icon: Select, tone: 'indigo' },
  { label: '近 7 天活跃', value: data.value.summary.activeSevenDays, hint: '近 7 天独立答题用户', icon: DataAnalysis, tone: 'violet' },
  { label: '近 7 天答题', value: data.value.summary.answersSevenDays, hint: `累计 ${formatDuration(data.value.summary.durationSevenDays)}`, icon: Timer, tone: 'orange' },
  { label: '近 7 天正确率', value: `${data.value.summary.accuracySevenDays}%`, hint: '按全部答题记录计算', icon: Clock, tone: 'green' }
]);

const onlineWindowLabel = computed(() => {
  const seconds = Math.max(0, Number(data.value.onlineWindowSeconds || 0));
  if (seconds && seconds < 120) return `${seconds} 秒`;
  const minutes = Number(data.value.onlineWindowMinutes || 0);
  if (minutes < 1) return '90 秒';
  return `${Number.isInteger(minutes) ? minutes : minutes.toFixed(1)} 分钟`;
});

function formatDuration(seconds: number) {
  const value = Math.max(0, Number(seconds || 0));
  if (value < 60) return `${value} 秒`;
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  if (hours) return `${hours} 小时 ${minutes} 分`;
  return `${minutes} 分钟`;
}

function relativeTime(value: string) {
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return '-';
  const seconds = Math.max(0, Math.round((Date.now() - time) / 1000));
  if (seconds < 60) return '刚刚';
  return `${Math.floor(seconds / 60)} 分钟前`;
}

function renderChart() {
  if (!chartRef.value) return;
  if (!chart) chart = init(chartRef.value);
  chart.setOption({
    color: ['#2563eb', '#14b8a6'],
    tooltip: { trigger: 'axis' },
    legend: {
      top: 0,
      right: 0,
      textStyle: { color: '#64748b', fontFamily: 'inherit' }
    },
    grid: { top: 42, right: 50, bottom: 30, left: 42, containLabel: true },
    xAxis: {
      type: 'category',
      boundaryGap: true,
      data: data.value.trend.map((item) => item.label),
      axisLine: { lineStyle: { color: '#dbe3ef' } },
      axisTick: { show: false },
      axisLabel: { color: '#64748b' }
    },
    yAxis: [
      {
        type: 'value',
        minInterval: 1,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: '#2563eb' },
        splitLine: { lineStyle: { color: '#edf1f7' } }
      },
      {
        type: 'value',
        minInterval: 1,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: '#14b8a6' },
        splitLine: { show: false }
      }
    ],
    series: [
      {
        name: '答题次数',
        type: 'bar',
        yAxisIndex: 0,
        barMaxWidth: 28,
        data: data.value.trend.map((item) => item.answerCount),
        itemStyle: { borderRadius: [6, 6, 0, 0] }
      },
      {
        name: '活跃用户',
        type: 'line',
        yAxisIndex: 1,
        smooth: true,
        symbolSize: 7,
        lineStyle: { width: 3 },
        data: data.value.trend.map((item) => item.activeUserCount)
      }
    ]
  });
}

async function load() {
  loading.value = true;
  try {
    data.value = await api.get<ActivityData>(`/admin/activity?days=${days.value}`);
    await nextTick();
    renderChart();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '活跃度数据加载失败');
  } finally {
    loading.value = false;
  }
}

function resizeChart() {
  chart?.resize();
}

onMounted(() => {
  load();
  window.addEventListener('resize', resizeChart);
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', resizeChart);
  chart?.dispose();
  chart = null;
});
</script>

<style scoped>
.activity-page {
  max-width: 1680px;
  margin: 0 auto;
}

.activity-hero {
  margin-bottom: 16px;
  border: 1px solid #dce6f4;
  border-radius: 10px;
  background: linear-gradient(135deg, #ffffff 0%, #f4f8ff 100%);
}

.activity-hero :deep(.el-card__body) {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  padding: 20px 22px;
}

.activity-kicker {
  margin-bottom: 5px;
  color: #2563eb;
  font-size: 13px;
  font-weight: 700;
}

.activity-hero h2 {
  margin: 0;
  color: #111827;
  font-size: 23px;
}

.activity-hero p {
  margin: 8px 0 0;
  color: #64748b;
}

.hero-actions {
  display: flex;
  gap: 10px;
  flex: 0 0 auto;
}

.metric-grid {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 14px;
  margin-bottom: 16px;
}

.metric-card {
  border: 1px solid #e4eaf2;
  border-radius: 10px;
}

.metric-card :deep(.el-card__body) {
  padding: 17px;
}

.metric-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: #64748b;
  font-size: 13px;
  font-weight: 600;
}

.metric-icon {
  display: grid;
  width: 32px;
  height: 32px;
  place-items: center;
  border-radius: 9px;
  font-size: 17px;
}

.metric-icon.blue { color: #2563eb; background: #eaf2ff; }
.metric-icon.cyan { color: #0891b2; background: #e6f8fb; }
.metric-icon.indigo { color: #4f46e5; background: #eeefff; }
.metric-icon.violet { color: #7c3aed; background: #f3eefe; }
.metric-icon.orange { color: #ea580c; background: #fff1e8; }
.metric-icon.green { color: #059669; background: #e9f8f2; }

.metric-card strong {
  display: block;
  margin-top: 10px;
  color: #172033;
  font-size: 28px;
  line-height: 1.1;
}

.metric-card small {
  display: block;
  margin-top: 8px;
  color: #94a3b8;
}

.activity-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.7fr) minmax(360px, .8fr);
  gap: 16px;
  margin-bottom: 16px;
}

.content-card {
  border: 1px solid #e4eaf2;
  border-radius: 10px;
}

.content-card :deep(.el-card__header) {
  padding: 15px 18px;
}

.card-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.card-heading strong {
  display: block;
  color: #1f2937;
  font-size: 16px;
}

.card-heading span {
  display: block;
  margin-top: 4px;
  color: #94a3b8;
  font-size: 12px;
}

.activity-chart {
  width: 100%;
  height: 322px;
}

.online-card :deep(.el-card__body),
.ranking-card :deep(.el-card__body) {
  padding: 0;
}

.online-indicator {
  display: inline-flex !important;
  align-items: center;
  gap: 6px;
  margin: 0 !important;
  color: #059669 !important;
  font-weight: 700;
}

.online-indicator i {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #10b981;
  box-shadow: 0 0 0 4px #dff8ed;
}

.accuracy-cell {
  display: grid;
  grid-template-columns: minmax(90px, 1fr) 44px;
  align-items: center;
  gap: 10px;
}

.accuracy-cell span {
  color: #475569;
  text-align: right;
}

@media (max-width: 1400px) {
  .metric-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}

@media (max-width: 980px) {
  .activity-grid { grid-template-columns: 1fr; }
  .activity-hero :deep(.el-card__body) { align-items: flex-start; flex-direction: column; }
}

@media (max-width: 640px) {
  .metric-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .hero-actions { width: 100%; flex-wrap: wrap; }
}
</style>
