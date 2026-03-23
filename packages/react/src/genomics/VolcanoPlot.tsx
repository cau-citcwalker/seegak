import { forwardRef, useEffect, useImperativeHandle } from 'react';
import {
  VolcanoPlotChart,
  type VolcanoData, type VolcanoOptions,
} from '@seegak/genomics';
import { useChart } from '../use-chart.js';

export interface VolcanoPlotProps extends VolcanoOptions {
  data?: VolcanoData | null;
  style?: React.CSSProperties;
  className?: string;
}

export interface VolcanoPlotHandle {
  update(data: VolcanoData): void;
  clear(): void;
  getChart(): VolcanoPlotChart | null;
}

export const VolcanoPlot = forwardRef<VolcanoPlotHandle, VolcanoPlotProps>(
  function VolcanoPlot({
    data,
    log2fcThreshold, pvalThreshold,
    upColor, downColor, nsColor,
    pointSize, opacity, labelTopN,
    onClickGene,
    style, className,
    ...rest
  }, ref) {
    const { containerRef, chartRef } = useChart<VolcanoPlotChart, VolcanoData>(
      VolcanoPlotChart,
      null,
      {
        log2fcThreshold, pvalThreshold,
        upColor, downColor, nsColor,
        pointSize, opacity, labelTopN,
        onClickGene,
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
      update(d: VolcanoData) {
        chartRef.current?.update(d);
      },
      clear() {
        // Reset to empty state
        chartRef.current?.update({ x: new Float32Array(0), y: new Float32Array(0), geneIds: [] });
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
