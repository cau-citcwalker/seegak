import { forwardRef, useImperativeHandle } from 'react';
import {
  BarChart as BarChartCore,
  type BarChartData, type BarChartOptions,
} from '@seegak/bio-charts';
import type { ToolType } from '@seegak/core';
import { useChart } from './use-chart.js';

export interface BarChartProps {
  data?: BarChartData | null;
  barWidth?: number;
  defaultColor?: string;
  gap?: number;
  tooltip?: boolean;
  toolbar?: boolean;
  defaultTool?: ToolType;
  tools?: ToolType[];
  /** Show axis labels and tick marks. Default: true */
  axes?: boolean;
  style?: React.CSSProperties;
  className?: string;
}

export interface BarChartHandle {
  instance: BarChartCore | null;
}

export const BarChart = forwardRef<BarChartHandle, BarChartProps>(
  function BarChart({ data, barWidth, defaultColor, gap, tooltip, toolbar, defaultTool, tools, axes, style, className }, ref) {
    const { containerRef, chartRef } = useChart<BarChartCore, BarChartData>(
      BarChartCore,
      data,
      { barWidth, defaultColor, gap, tooltip, toolbar, defaultTool, tools, axes } as unknown as Record<string, unknown>,
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
