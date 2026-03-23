import { forwardRef, useImperativeHandle } from 'react';
import {
  PieChart as PieChartCore,
  type PieChartData, type PieChartOptions,
} from '@seegak/bio-charts';
import type { ToolType } from '@seegak/core';
import { useChart } from './use-chart.js';

export interface PieChartProps {
  data?: PieChartData | null;
  showLabels?: boolean;
  showPercentage?: boolean;
  tooltip?: boolean;
  toolbar?: boolean;
  defaultTool?: ToolType;
  tools?: ToolType[];
  style?: React.CSSProperties;
  className?: string;
}

export interface PieChartHandle {
  instance: PieChartCore | null;
}

export const PieChart = forwardRef<PieChartHandle, PieChartProps>(
  function PieChart({ data, showLabels, showPercentage, tooltip, toolbar, defaultTool, tools, style, className }, ref) {
    const { containerRef, chartRef } = useChart<PieChartCore, PieChartData>(
      PieChartCore,
      data,
      { showLabels, showPercentage, tooltip, toolbar, defaultTool, tools } as unknown as Record<string, unknown>,
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
