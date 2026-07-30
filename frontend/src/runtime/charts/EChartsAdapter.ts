/**
 * ECharts option builder — isolates echarts option shape from page components.
 * Components still receive ChartModel; this module only maps model → echarts option.
 */

import type { ChartModel } from './types';
import { formatChartValue } from './bindings';

export type EChartsOption = Record<string, unknown>;

export function chartModelToEchartsOption(model: ChartModel): EChartsOption {
  const color = model.color || '#06b6d4';
  const names = model.points.map((p) => p.name);
  const values = model.points.map((p) => p.value);

  if (model.kind === 'pieChart') {
    return {
      color: ['#06b6d4', '#8b5cf6', '#f59e0b', '#10b981', '#f43f5e', '#3b82f6'],
      tooltip: { trigger: 'item' },
      legend: model.legend ? { bottom: 0, type: 'scroll' } : undefined,
      series: [
        {
          type: 'pie',
          radius: ['35%', '65%'],
          data: model.points.map((p) => ({ name: p.name, value: p.value })),
          emphasis: { itemStyle: { shadowBlur: 12, shadowColor: 'rgba(0,0,0,0.2)' } },
        },
      ],
    };
  }

  const isBar = model.kind === 'barChart';
  return {
    color: [color],
    grid: { left: 40, right: 16, top: 28, bottom: model.legend ? 48 : 28 },
    tooltip: {
      trigger: 'axis',
      valueFormatter: (v: number) => formatChartValue(Number(v), model.format, model.unit),
    },
    legend: model.legend ? { bottom: 0 } : undefined,
    xAxis: {
      type: 'category',
      data: names,
      axisLabel: { color: '#64748b', hideOverlap: true },
    },
    yAxis: {
      type: 'value',
      axisLabel: {
        color: '#64748b',
        formatter: (v: number) => formatChartValue(Number(v), model.format),
      },
      splitLine: { lineStyle: { color: '#e2e8f0' } },
    },
    series: [
      {
        type: isBar ? 'bar' : 'line',
        data: values,
        smooth: !isBar,
        showSymbol: !isBar,
        barMaxWidth: 36,
        areaStyle: isBar ? undefined : { opacity: 0.08 },
      },
    ],
  };
}
