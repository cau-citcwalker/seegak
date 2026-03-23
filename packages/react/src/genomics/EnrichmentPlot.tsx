import { forwardRef, useEffect, useImperativeHandle } from 'react';
import {
  EnrichmentPlotChart,
  type EnrichmentData, type EnrichmentOptions,
} from '@seegak/genomics';
import { useChart } from '../use-chart.js';

export interface EnrichmentPlotProps extends EnrichmentOptions {
  data?: EnrichmentData | null;
  style?: React.CSSProperties;
  className?: string;
}

export interface EnrichmentPlotHandle {
  update(data: EnrichmentData): void;
  clear(): void;
  getChart(): EnrichmentPlotChart | null;
}

export const EnrichmentPlot = forwardRef<EnrichmentPlotHandle, EnrichmentPlotProps>(
  function EnrichmentPlot({
    data,
    scoreColor, hitColor, showStats,
    style, className,
    ...rest
  }, ref) {
    const { containerRef, chartRef } = useChart<EnrichmentPlotChart, EnrichmentData>(
      EnrichmentPlotChart,
      null,
      {
        scoreColor, hitColor, showStats,
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
      update(d: EnrichmentData) {
        chartRef.current?.update(d);
      },
      clear() {
        chartRef.current?.update({
          runningScore: new Float32Array(0),
          hitPositions: new Uint32Array(0),
          totalGenes: 0,
          geneSetName: '',
          es: 0,
          nes: 0,
          pval: 1,
          fdr: 1,
        });
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
