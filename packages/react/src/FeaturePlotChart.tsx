import { forwardRef, useImperativeHandle } from 'react';
import {
  FeaturePlotChart as FeaturePlotChartCore,
  type FeaturePlotData, type FeaturePlotOptions,
} from '@seegak/bio-charts';
import type { ColorScale, ToolType, SelectionEvent } from '@seegak/core';
import { useChart } from './use-chart.js';

export interface FeaturePlotChartProps {
  data?: FeaturePlotData | null;
  pointSize?: number;
  opacity?: number;
  colorScale?: ColorScale;
  autoFit?: boolean;
  tooltip?: boolean;
  toolbar?: boolean;
  defaultTool?: ToolType;
  tools?: ToolType[];
  onSelect?: (e: SelectionEvent) => void;
  style?: React.CSSProperties;
  className?: string;
}

export interface FeaturePlotChartHandle {
  instance: FeaturePlotChartCore | null;
}

export const FeaturePlotChart = forwardRef<FeaturePlotChartHandle, FeaturePlotChartProps>(
  function FeaturePlotChart({
    data, pointSize, opacity, colorScale, autoFit, tooltip,
    toolbar, defaultTool, tools, onSelect,
    style, className,
  }, ref) {
    const { containerRef, chartRef } = useChart<FeaturePlotChartCore, FeaturePlotData>(
      FeaturePlotChartCore,
      data,
      { pointSize, opacity, colorScale, autoFit, tooltip, toolbar, defaultTool, tools, onSelect } as unknown as Record<string, unknown>,
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
