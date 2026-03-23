import { forwardRef, useImperativeHandle } from 'react';
import {
  DotPlotChart as DotPlotChartCore,
  type DotPlotData, type DotPlotOptions,
} from '@seegak/bio-charts';
import type { ColorScale } from '@seegak/core';
import { useChart } from './use-chart.js';

export interface DotPlotChartProps {
  data?: DotPlotData | null;
  maxRadius?: number;
  colorScale?: ColorScale;
  opacity?: number;
  tooltip?: boolean;
  /** Show axis labels. Default: true */
  axes?: boolean;
  style?: React.CSSProperties;
  className?: string;
}

export interface DotPlotChartHandle {
  instance: DotPlotChartCore | null;
}

export const DotPlotChart = forwardRef<DotPlotChartHandle, DotPlotChartProps>(
  function DotPlotChart({ data, maxRadius, colorScale, opacity, tooltip, axes, style, className }, ref) {
    const { containerRef, chartRef } = useChart<DotPlotChartCore, DotPlotData>(
      DotPlotChartCore,
      data,
      { maxRadius, colorScale, opacity, tooltip, axes } as unknown as Record<string, unknown>,
    );

    useImperativeHandle(ref, () => ({
      get instance() { return chartRef.current; },
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
