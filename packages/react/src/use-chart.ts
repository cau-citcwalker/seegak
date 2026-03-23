import { useRef, useEffect, useCallback } from 'react';
import type { BaseChart } from '@seegak/bio-charts';

/**
 * Generic hook that manages the lifecycle of a chart instance.
 * Creates the chart on mount, destroys on unmount,
 * and updates when data changes.
 */
export function useChart<
  TChart extends BaseChart,
  TData,
>(
  ChartClass: new (container: HTMLElement, options: Record<string, unknown>) => TChart,
  data: TData | null | undefined,
  options: Record<string, unknown> = {},
): {
  containerRef: React.RefObject<HTMLDivElement>;
  chartRef: React.MutableRefObject<TChart | null>;
} {
  const containerRef = useRef<HTMLDivElement>(null!);
  const chartRef = useRef<TChart | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  // Create chart on mount
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = new ChartClass(containerRef.current, optionsRef.current);
    chartRef.current = chart;

    return () => {
      chart.destroy();
      chartRef.current = null;
    };
    // Only re-create if ChartClass changes (shouldn't normally happen)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ChartClass]);

  // Update data when it changes
  useEffect(() => {
    if (chartRef.current && data != null) {
      chartRef.current.update(data as unknown);
    }
  }, [data]);

  return { containerRef, chartRef };
}
