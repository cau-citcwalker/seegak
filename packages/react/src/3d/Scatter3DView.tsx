import { forwardRef, useEffect, useImperativeHandle } from 'react';
import {
  Scatter3DView as Scatter3DViewCore,
  type Scatter3DData, type Scatter3DOptions,
} from '@seegak/3d';
import { useChart } from '../use-chart.js';

export interface Scatter3DViewProps extends Scatter3DOptions {
  data?: Scatter3DData | null;
  style?: React.CSSProperties;
  className?: string;
}

export interface Scatter3DViewHandle {
  setData(data: Scatter3DData): void;
  setFlatten(flatten: boolean): void;
  setPointSize(size: number): void;
  setOpacity(v: number): void;
  getLabelColors(): Array<{ label: string; color: string }>;
  getChart(): Scatter3DViewCore | null;
}

export const Scatter3DView = forwardRef<Scatter3DViewHandle, Scatter3DViewProps>(
  function Scatter3DView({
    data,
    pointSize, opacity, flatten,
    style, className,
    ...rest
  }, ref) {
    const { containerRef, chartRef } = useChart<Scatter3DViewCore, Scatter3DData>(
      Scatter3DViewCore,
      null,
      {
        pointSize, opacity, flatten,
        ...rest,
      } as unknown as Record<string, unknown>,
    );

    useEffect(() => {
      if (!chartRef.current || data == null) return;
      chartRef.current.setData(data);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [data]);

    useImperativeHandle(ref, () => ({
      setData(d: Scatter3DData) {
        chartRef.current?.setData(d);
      },
      setFlatten(f: boolean) {
        chartRef.current?.setFlatten(f);
      },
      setPointSize(s: number) {
        chartRef.current?.setPointSize(s);
      },
      setOpacity(v: number) {
        chartRef.current?.setOpacity(v);
      },
      getLabelColors() {
        return chartRef.current?.getLabelColors() ?? [];
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
