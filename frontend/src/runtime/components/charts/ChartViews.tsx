import { useEffect, useMemo, useRef } from 'react';
import * as echarts from 'echarts/core';
import type { EChartsType } from 'echarts/core';
import { BarChart, LineChart, PieChart } from 'echarts/charts';
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { ChartClickPayload, ChartModel } from '../../charts/types';
import { chartModelToEchartsOption } from '../../charts/EChartsAdapter';
import { ComponentEmptyState, ComponentErrorState, ComponentLoadingState } from '../ComponentStates';

echarts.use([BarChart, LineChart, PieChart, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer]);

export function ChartShell({
  model,
  status,
  error,
  onPointClick,
}: {
  model: ChartModel;
  status: string;
  error?: string | null;
  onPointClick?: (payload: ChartClickPayload) => void;
}) {
  if (status === 'loading') {
    return <ComponentLoadingState label="Loading chart" />;
  }
  if (status === 'error') {
    return <ComponentErrorState message={error || 'Chart error'} />;
  }

  return (
    <div
      className="rounded-[26px] border border-slate-200 bg-white/90 p-5 shadow-[0_20px_70px_rgba(15,23,42,0.08)]"
      data-chart-kind={model.kind}
    >
      {(model.title || model.subtitle) && model.kind !== 'stat' && (
        <div className="mb-3">
          {model.title ? (
            <div className="text-sm font-semibold text-slate-900">{model.title}</div>
          ) : null}
          {model.subtitle ? (
            <div className="mt-1 text-xs text-slate-500">{model.subtitle}</div>
          ) : null}
        </div>
      )}

      {model.kind === 'stat' ? (
        <StatView model={model} onPointClick={onPointClick} />
      ) : model.kind === 'text' ? (
        <TextView model={model} />
      ) : model.points.length === 0 ? (
        <ComponentEmptyState message={model.emptyMessage} />
      ) : (
        <EChartsView model={model} onPointClick={onPointClick} />
      )}
    </div>
  );
}

function StatView({
  model,
  onPointClick,
}: {
  model: ChartModel;
  onPointClick?: (payload: ChartClickPayload) => void;
}) {
  const point = model.points[0];
  return (
    <button
      type="button"
      className="w-full rounded-2xl bg-slate-50 px-4 py-6 text-left transition hover:bg-cyan-50"
      onClick={() => {
        if (point) {
          onPointClick?.({
            name: point.name,
            value: point.value,
            dataIndex: point.dataIndex,
            row: point.row,
          });
        }
      }}
    >
      <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">
        {model.title || 'Stat'}
      </div>
      <div className="mt-3 text-3xl font-semibold tracking-tight text-slate-900">
        {model.displayText ?? '—'}
      </div>
      {model.subtitle ? <div className="mt-2 text-xs text-slate-500">{model.subtitle}</div> : null}
    </button>
  );
}

function TextView({ model }: { model: ChartModel }) {
  if (!model.displayText) {
    return <ComponentEmptyState message={model.emptyMessage} />;
  }
  return (
    <div className="prose prose-sm max-w-none text-slate-700">
      {model.title ? <div className="mb-2 text-sm font-semibold text-slate-900">{model.title}</div> : null}
      <p className="whitespace-pre-wrap leading-7">{model.displayText}</p>
    </div>
  );
}

function EChartsView({
  model,
  onPointClick,
}: {
  model: ChartModel;
  onPointClick?: (payload: ChartClickPayload) => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<EChartsType | null>(null);
  const modelRef = useRef(model);
  const onClickRef = useRef(onPointClick);

  useEffect(() => {
    modelRef.current = model;
    onClickRef.current = onPointClick;
  }, [model, onPointClick]);

  // Only re-bind chart when series data actually changes (avoid dispose/init storms).
  const modelKey = useMemo(
    () =>
      JSON.stringify({
        kind: model.kind,
        title: model.title,
        height: model.height,
        legend: model.legend,
        format: model.format,
        color: model.color,
        points: model.points.map((p) => [p.name, p.value]),
      }),
    [model],
  );

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let chart = chartRef.current;
    try {
      if (!chart) {
        chart = echarts.init(el, undefined, { renderer: 'canvas' });
        chartRef.current = chart;
      }
      const current = modelRef.current;
      chart.setOption(chartModelToEchartsOption(current), true);
      chart.off('click');
      chart.on('click', (params: unknown) => {
        const p = params as { name?: string; dataIndex?: number };
        const dataIndex = typeof p.dataIndex === 'number' ? p.dataIndex : 0;
        const m = modelRef.current;
        const point = m.points[dataIndex] || m.points.find((x) => x.name === p.name);
        if (!point) return;
        onClickRef.current?.({
          name: point.name,
          value: point.value,
          dataIndex: point.dataIndex,
          row: point.row,
        });
      });
      requestAnimationFrame(() => {
        try {
          chart?.resize();
        } catch {
          /* ignore */
        }
      });
    } catch (err) {
      console.error('[chart] echarts render failed', err);
    }

    const onResize = () => {
      try {
        chartRef.current?.resize();
      } catch {
        /* ignore */
      }
    };
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
    };
  }, [modelKey]);

  // Dispose once when leaving the page/component.
  useEffect(() => {
    return () => {
      try {
        chartRef.current?.dispose();
      } catch {
        /* ignore */
      }
      chartRef.current = null;
    };
  }, []);

  return (
    <div
      ref={ref}
      style={{ height: model.height, width: '100%', minHeight: 120 }}
      data-testid={`chart-${model.kind}`}
      role="img"
      aria-label={model.title || model.kind}
    />
  );
}
