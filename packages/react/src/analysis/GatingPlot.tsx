import { forwardRef, useEffect, useImperativeHandle } from 'react';
import {
  GatingPlot as GatingPlotCore,
  type GatingPlotData, type GatingPlotOptions,
} from '@seegak/analysis';
import type { GateManager } from '@seegak/analysis';
import { useChart } from '../use-chart.js';

export interface GatingPlotProps extends GatingPlotOptions {
  data?: GatingPlotData | null;
  style?: React.CSSProperties;
  className?: string;
}

export interface GatingPlotHandle {
  update(data: GatingPlotData): void;
  getGateManager(): GateManager | null;
  getChart(): GatingPlotCore | null;
}

export const GatingPlot = forwardRef<GatingPlotHandle, GatingPlotProps>(
  function GatingPlot({
    data,
    onGateCreated, onGateSelected,
    style, className,
    ...rest
  }, ref) {
    const { containerRef, chartRef } = useChart<GatingPlotCore, GatingPlotData>(
      GatingPlotCore,
      null,
      {
        onGateCreated, onGateSelected,
        ...rest,
      } as unknown as Record<string, unknown>,
    );

    useEffect(() => {
      if (!chartRef.current || data == null) return;
      chartRef.current.update(data);
    // chartRef is a stable mutable ref, excluded intentionally
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [data]);

    useImperativeHandle(ref, () => ({
      update(d: GatingPlotData) {
        chartRef.current?.update(d);
      },
      getGateManager() {
        return chartRef.current?.gateManager ?? null;
      },
      getChart() {
        return chartRef.current;
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
