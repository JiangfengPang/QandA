import { BarChart, LineChart } from 'echarts/charts';
import {
  GridComponent,
  LegendComponent,
  TooltipComponent
} from 'echarts/components';
import { init, use, type ECharts, type EChartsCoreOption } from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import { ref } from 'vue';
import type { ComputedRef, Ref } from 'vue';
import type { DailyTrend, StatsPayload, SubjectStat } from '../types/stats';

const chartFont = '-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",Arial,sans-serif';

use([BarChart, LineChart, GridComponent, LegendComponent, TooltipComponent, CanvasRenderer]);

function isMobileViewport() {
  return window.innerWidth <= 760;
}

function normalizeTrend(rows: DailyTrend[]) {
  if (rows.length) return rows;
  const now = new Date();
  return Array.from({ length: 7 }).map((_, index) => {
    const date = new Date(now);
    date.setDate(now.getDate() - (6 - index));
    const label = `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`;
    return { date: label, label, answerCount: 0, correctCount: 0, accuracy: 0 };
  });
}

export function useStatsCharts(
  stats: Ref<StatsPayload>,
  wrongDistribution: ComputedRef<SubjectStat[]>,
  hasWrongDistribution: ComputedRef<boolean>
) {
  const trendRef = ref<HTMLDivElement | null>(null);
  const wrongRef = ref<HTMLDivElement | null>(null);
  let trendChart: ECharts | null = null;
  let wrongChart: ECharts | null = null;

  function renderCharts() {
    if (!trendRef.value) return;
    disposeCharts();

    trendChart = init(trendRef.value);
    trendChart.setOption(buildTrendOption(), true);

    if (wrongRef.value && hasWrongDistribution.value) {
      wrongChart = init(wrongRef.value);
      wrongChart.setOption(buildWrongDistributionOption(), true);
    }

    resizeCharts();
  }

  function disposeCharts() {
    trendChart?.dispose();
    wrongChart?.dispose();
    trendChart = null;
    wrongChart = null;
  }

  function resizeCharts() {
    trendChart?.resize();
    wrongChart?.resize();
  }

  function buildTrendOption(): EChartsCoreOption {
    const isMobile = isMobileViewport();
    const trend = normalizeTrend(stats.value.dailyTrend || []);
    const maxAnswer = Math.max(5, ...trend.map((item) => Number(item.answerCount || 0)));

    return {
      animationDuration: 650,
      grid: { left: isMobile ? 34 : 44, right: isMobile ? 42 : 48, top: 34, bottom: 34 },
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(15,23,42,.9)',
        borderWidth: 0,
        textStyle: { color: '#fff' },
        formatter(params: unknown) {
          const list = Array.isArray(params) ? params : [];
          const dataIndex = Number((list[0] as any)?.dataIndex || 0);
          const row = trend[dataIndex] || trend[0];
          return `${row.label}<br/>答题数：${row.answerCount} 题<br/>正确数：${row.correctCount} 题<br/>正确率：${row.accuracy}%`;
        }
      },
      legend: {
        top: 2,
        data: ['答题数', '正确率'],
        itemWidth: 20,
        itemHeight: 7,
        itemGap: 18,
        textStyle: { fontFamily: chartFont, color: '#64748b', fontWeight: 500, fontSize: isMobile ? 10 : 12 }
      },
      xAxis: {
        type: 'category',
        data: trend.map((item) => item.label),
        axisTick: { show: false },
        axisLine: { lineStyle: { color: '#e5edf7' } },
        axisLabel: { color: '#64748b', fontFamily: chartFont, fontWeight: 500, fontSize: isMobile ? 10 : 12 }
      },
      yAxis: [
        {
          type: 'value',
          min: 0,
          max: Math.ceil(maxAnswer * 1.15),
          minInterval: 1,
          splitLine: { lineStyle: { color: '#edf2f8' } },
          axisLabel: { color: '#64748b', fontFamily: chartFont, fontWeight: 500, fontSize: isMobile ? 10 : 12 }
        },
        {
          type: 'value',
          min: 0,
          max: 100,
          axisLabel: { formatter: '{value}%', color: '#64748b', fontFamily: chartFont, fontWeight: 500, fontSize: isMobile ? 10 : 12 },
          splitLine: { show: false }
        }
      ],
      series: [
        {
          name: '答题数',
          type: 'bar',
          data: trend.map((item) => item.answerCount),
          barWidth: isMobile ? 10 : 13,
          itemStyle: { color: '#2087ff', borderRadius: [8, 8, 0, 0] }
        },
        {
          name: '正确率',
          type: 'line',
          yAxisIndex: 1,
          data: trend.map((item) => item.accuracy),
          smooth: true,
          symbol: 'circle',
          symbolSize: 7,
          lineStyle: { width: 3, color: '#f97316' },
          itemStyle: { color: '#fff', borderColor: '#f97316', borderWidth: 3 }
        }
      ]
    };
  }

  function buildWrongDistributionOption(): EChartsCoreOption {
    const isMobile = isMobileViewport();
    const rows = [...wrongDistribution.value].reverse();
    const maxWrong = Math.max(1, ...rows.map((item) => Number(item.wrongQuestionCount || 0)));

    return {
      animationDuration: 650,
      grid: { left: isMobile ? 88 : 104, right: isMobile ? 38 : 50, top: 12, bottom: 20 },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        backgroundColor: 'rgba(15,23,42,.9)',
        borderWidth: 0,
        textStyle: { color: '#fff' },
        formatter(params: unknown) {
          const list = Array.isArray(params) ? params : [];
          const dataIndex = Number((list[0] as any)?.dataIndex || 0);
          const item = rows[dataIndex] || rows[0];
          return `${item.name}<br/>错题：${item.wrongQuestionCount || 0} 题<br/>正确率：${item.accuracy || 0}%<br/>已做：${item.answerCount || 0} 题`;
        }
      },
      xAxis: {
        type: 'value',
        max: Math.ceil(maxWrong * 1.2),
        minInterval: 1,
        splitLine: { lineStyle: { color: '#edf2f8' } },
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: '#64748b', fontFamily: chartFont, fontWeight: 500, fontSize: isMobile ? 10 : 12 }
      },
      yAxis: {
        type: 'category',
        data: rows.map((item) => item.name),
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: {
          color: '#334155',
          fontFamily: chartFont,
          fontWeight: 500,
          fontSize: isMobile ? 10 : 12,
          width: isMobile ? 72 : 92,
          overflow: 'truncate'
        }
      },
      series: [
        {
          name: '错题数',
          type: 'bar',
          data: rows.map((item) => item.wrongQuestionCount || 0),
          barWidth: isMobile ? 11 : 14,
          itemStyle: { color: '#ff4f6d', borderRadius: [0, 999, 999, 0] },
          label: {
            show: true,
            position: 'right',
            formatter: '{c} 题',
            color: '#334155',
            fontFamily: chartFont,
            fontWeight: 600,
            fontSize: isMobile ? 10 : 12
          }
        }
      ]
    };
  }

  return { trendRef, wrongRef, renderCharts, disposeCharts, resizeCharts };
}
