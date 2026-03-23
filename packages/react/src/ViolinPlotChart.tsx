import { forwardRef, useImperativeHandle } from 'react';
import {
  ViolinPlotChart as ViolinPlotChartCore,
  type ViolinPlotData, type ViolinPlotOptions,
} from '@seegak/bio-charts';
import { useChart } from './use-chart.js';

export interface ViolinPlotChartProps {
  data?: ViolinPlotData | null;
  kdeSamples?: number;
  widthFraction?: number;
  showBox?: boolean;
  tooltip?: boolean;
  /** Show axis labels. Default: true */
  axes?: boolean;
  style?: React.CSSProperties;
  className?: string;
}

export interface ViolinPlotChartHandle {
  instance: ViolinPlotChartCore | null;
}

export const ViolinPlotChart = forwardRef<ViolinPlotChartHandle, ViolinPlotChartProps>(
  function ViolinPlotChart({ data, kdeSamples, widthFraction, showBox, tooltip, axes, style, className }, ref) {
    const { containerRef, chartRef } = useChart<ViolinPlotChartCore, ViolinPlotData>(
      ViolinPlotChartCore,
      data,
      { kdeSamples, widthFraction, showBox, tooltip, axes } as unknown as Record<string, unknown>,
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
