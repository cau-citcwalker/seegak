import { forwardRef, useImperativeHandle } from 'react';
import {
  HeatmapChart as HeatmapChartCore,
  type HeatmapData, type HeatmapOptions, type HeatmapNormalize,
} from '@seegak/bio-charts';
import type { ColorScale } from '@seegak/core';
import { useChart } from './use-chart.js';

export type { HeatmapNormalize };

export interface HeatmapChartProps {
  data?: HeatmapData | null;
  colorScale?: ColorScale;
  normalize?: HeatmapNormalize;
  tooltip?: boolean;
  /** Show axis labels. Default: true */
  axes?: boolean;
  style?: React.CSSProperties;
  className?: string;
}

export interface HeatmapChartHandle {
  instance: HeatmapChartCore | null;
}

export const HeatmapChart = forwardRef<HeatmapChartHandle, HeatmapChartProps>(
  function HeatmapChart({ data, colorScale, normalize, tooltip, axes, style, className }, ref) {
    const { containerRef, chartRef } = useChart<HeatmapChartCore, HeatmapData>(
      HeatmapChartCore,
      data,
      { colorScale, normalize, tooltip, axes } as unknown as Record<string, unknown>,
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
