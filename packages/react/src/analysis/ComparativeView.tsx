import React, { useEffect } from 'react';
import { ComparativeViewController, type ComparativeViewOptions } from '@seegak/analysis';
import type { ScatterChartHandle } from '../ScatterChart.js';

export interface ComparativeViewProps {
  chartA: React.RefObject<ScatterChartHandle | null>;
  chartB: React.RefObject<ScatterChartHandle | null>;
  options: ComparativeViewOptions;
}

/**
 * ComparativeView synchronises two ScatterChart instances based on the
 * provided ComparativeViewOptions (syncZoom, syncPan).  It renders nothing
 * itself; the host application is responsible for rendering the two charts.
 *
 * @example
 * ```tsx
 * const refA = useRef<ScatterChartHandle>(null);
 * const refB = useRef<ScatterChartHandle>(null);
 *
 * return (
 *   <>
 *     <ScatterChart ref={refA} data={dataA} />
 *     <ScatterChart ref={refB} data={dataB} />
 *     <ComparativeView chartA={refA} chartB={refB} options={options} />
 *   </>
 * );
 * ```
 */
export function ComparativeView({ chartA, chartB, options }: ComparativeViewProps): null {
  useEffect(() => {
    const { syncZoom = true, syncPan = true } = options;
    if (!syncZoom && !syncPan) return;

    // Defer until both chart instances are mounted
    const rafId = requestAnimationFrame(() => {
      const instanceA = chartA.current?.instance;
      const instanceB = chartB.current?.instance;
      if (!instanceA || !instanceB) return;

      const controller = new ComparativeViewController(options);
      const unlink = controller.linkCharts(instanceA, instanceB);

      // The RAF callback itself doesn't return a cleanup; cleanup is handled
      // by the outer useEffect return below via the captured unlink ref.
      (rafCleanup as { fn?: () => void }).fn = unlink;
    });

    const rafCleanup: { fn?: () => void } = {};

    return () => {
      cancelAnimationFrame(rafId);
      rafCleanup.fn?.();
    };
  // Re-run when option flags or chart refs change
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartA, chartB, options.syncZoom, options.syncPan]);

  return null;
}
