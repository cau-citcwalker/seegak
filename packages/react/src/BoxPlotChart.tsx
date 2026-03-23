import { forwardRef, useImperativeHandle } from 'react';
import {
  BoxPlotChart as BoxPlotChartCore,
  type BoxPlotData, type BoxPlotOptions,
} from '@seegak/bio-charts';
import type { ToolType } from '@seegak/core';
import { useChart } from './use-chart.js';

export interface BoxPlotChartProps {
  data?: BoxPlotData | null;
  boxWidth?: number;
  whiskerWidth?: number;
  showOutliers?: boolean;
  outlierSize?: number;
  defaultColor?: string;
  tooltip?: boolean;
  toolbar?: boolean;
  defaultTool?: ToolType;
  tools?: ToolType[];
  /** Show axis labels and tick marks. Default: true */
  axes?: boolean;
  style?: React.CSSProperties;
  className?: string;
}

export interface BoxPlotChartHandle {
  instance: BoxPlotChartCore | null;
}

export const BoxPlotChart = forwardRef<BoxPlotChartHandle, BoxPlotChartProps>(
  function BoxPlotChart({ data, boxWidth, whiskerWidth, showOutliers, outlierSize, defaultColor, tooltip, toolbar, defaultTool, tools, axes, style, className }, ref) {
    const { containerRef, chartRef } = useChart<BoxPlotChartCore, BoxPlotData>(
      BoxPlotChartCore,
      data,
      { boxWidth, whiskerWidth, showOutliers, outlierSize, defaultColor, tooltip, toolbar, defaultTool, tools, axes } as unknown as Record<string, unknown>,
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
