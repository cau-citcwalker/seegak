import { forwardRef, useEffect, useImperativeHandle } from 'react';
import {
  GenomicProfileChart,
  type GenomicProfileData, type GenomicProfileOptions,
} from '@seegak/genomics';
import { useChart } from '../use-chart.js';

export interface GenomicProfileProps extends GenomicProfileOptions {
  data?: GenomicProfileData | null;
  style?: React.CSSProperties;
  className?: string;
}

export interface GenomicProfileHandle {
  update(data: GenomicProfileData): void;
  clear(): void;
  getChart(): GenomicProfileChart | null;
}

export const GenomicProfile = forwardRef<GenomicProfileHandle, GenomicProfileProps>(
  function GenomicProfile({
    data,
    fillColor, lineColor, trackHeight,
    style, className,
    ...rest
  }, ref) {
    const { containerRef, chartRef } = useChart<GenomicProfileChart, GenomicProfileData>(
      GenomicProfileChart,
      null,
      {
        fillColor, lineColor, trackHeight,
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
      update(d: GenomicProfileData) {
        chartRef.current?.update(d);
      },
      clear() {
        chartRef.current?.update({
          chrom: '',
          start: 0,
          end: 0,
          values: new Float32Array(0),
          binSize: 1,
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
