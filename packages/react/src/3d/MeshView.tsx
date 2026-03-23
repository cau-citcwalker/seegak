import { forwardRef, useEffect, useImperativeHandle } from 'react';
import {
  MeshView as MeshViewCore,
  type MeshData, type MeshOptions,
} from '@seegak/3d';
import { useChart } from '../use-chart.js';

export interface MeshViewProps extends MeshOptions {
  data?: MeshData | null;
  style?: React.CSSProperties;
  className?: string;
}

export interface MeshViewHandle {
  setData(data: MeshData): void;
  setWireframe(val: boolean): void;
  getChart(): MeshViewCore | null;
}

export const MeshView = forwardRef<MeshViewHandle, MeshViewProps>(
  function MeshView({
    data,
    wireframe, color, opacity, lighting,
    style, className,
    ...rest
  }, ref) {
    const { containerRef, chartRef } = useChart<MeshViewCore, MeshData>(
      MeshViewCore,
      null,
      {
        wireframe, color, opacity, lighting,
        ...rest,
      } as unknown as Record<string, unknown>,
    );

    useEffect(() => {
      if (!chartRef.current || data == null) return;
      chartRef.current.setData(data);
    // chartRef is a stable mutable ref, excluded intentionally
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [data]);

    useImperativeHandle(ref, () => ({
      setData(d: MeshData) {
        chartRef.current?.setData(d);
      },
      setWireframe(val: boolean) {
        chartRef.current?.setWireframe(val);
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
