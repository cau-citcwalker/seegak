import { forwardRef, useEffect, useImperativeHandle } from 'react';
import {
  ScatterChart as ScatterChartCore,
  type ScatterData, type ScatterOptions, type ScatterTooltipData, type ScatterSelectEvent,
} from '@seegak/bio-charts';
import type { ColorScale, DataWorker, ToolType } from '@seegak/core';
import { useChart } from './use-chart.js';

export type { ScatterTooltipData, ScatterSelectEvent };

export interface ScatterChartProps {
  data?: ScatterData | null;
  pointSize?: number;
  opacity?: number;
  colorScale?: ColorScale;
  autoFit?: boolean;
  tooltip?: boolean;
  tooltipFormatter?: ScatterOptions['tooltipFormatter'];
  /** Show toolbar. Default: true */
  toolbar?: boolean;
  defaultTool?: ToolType;
  tools?: ToolType[];
  onSelectPoints?: (e: ScatterSelectEvent) => void;
  /** Show cluster legend panel. Default: true when labels present */
  legend?: boolean;
  legendTitle?: string;
  legendPosition?: 'left' | 'right';
  /** Show axis labels and tick marks. Default: true */
  axes?: boolean;
  /** X-axis label text */
  xLabel?: string;
  /** Y-axis label text */
  yLabel?: string;
  /**
   * DataWorker instance for async LoD downsampling.
   * When provided and data.x.length > 500k, the dataset is downsampled in a Worker.
   *
   * @example
   * import DataWorkerImpl from '@seegak/core/worker/data-worker-impl?worker';
   * import { DataWorker } from '@seegak/core';
   * const worker = DataWorker.fromWorker(new DataWorkerImpl());
   * <ScatterChart worker={worker} data={data} />
   */
  worker?: DataWorker;
  style?: React.CSSProperties;
  className?: string;
}

export interface ScatterChartHandle {
  instance: ScatterChartCore | null;
  hitTest: (x: number, y: number) => number | null;
}

export const ScatterChart = forwardRef<ScatterChartHandle, ScatterChartProps>(
  function ScatterChart({
    data, pointSize, opacity, colorScale, autoFit,
    tooltip, tooltipFormatter,
    toolbar, defaultTool, tools, onSelectPoints,
    legend, legendTitle, legendPosition,
    axes, xLabel, yLabel,
    worker,
    style, className,
  }, ref) {
    // Pass null for data — we handle updates below to support async worker path
    const { containerRef, chartRef } = useChart<ScatterChartCore, ScatterData>(
      ScatterChartCore,
      null,
      {
        pointSize, opacity, colorScale, autoFit, tooltip, tooltipFormatter,
        toolbar, defaultTool, tools, onSelectPoints,
        legend, legendTitle, legendPosition,
        axes, xLabel, yLabel,
      } as unknown as Record<string, unknown>,
    );

    useEffect(() => {
      if (!chartRef.current || data == null) return;
      if (worker) {
        void chartRef.current.updateAsync(data, worker);
      } else {
        chartRef.current.update(data);
      }
    // chartRef is a stable mutable ref, excluded intentionally
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [data, worker]);

    useImperativeHandle(ref, () => ({
      get instance() { return chartRef.current; },
      hitTest(x: number, y: number) {
        return chartRef.current?.hitTest(x, y) ?? null;
      },
    }));

    return (
      <div
        ref={containerRef}
        className={className}
        style={{ width: '100%', height: '100%', ...style }}
      />
    );
  },
);
