import { forwardRef, useEffect, useImperativeHandle } from 'react';
import {
  VolumeView as VolumeViewCore,
  type VolumeData, type VolumeOptions,
} from '@seegak/3d';
import { useChart } from '../use-chart.js';

export interface VolumeViewProps extends VolumeOptions {
  data?: VolumeData | null;
  style?: React.CSSProperties;
  className?: string;
}

export interface VolumeViewHandle {
  setData(data: VolumeData): void;
  setRenderMode(mode: NonNullable<VolumeOptions['renderMode']>): void;
  setIsoValue(val: number): void;
  getChart(): VolumeViewCore | null;
}

export const VolumeView = forwardRef<VolumeViewHandle, VolumeViewProps>(
  function VolumeView({
    data,
    renderMode, isoValue, colorScale, opacity,
    clipX, clipY, clipZ,
    style, className,
    ...rest
  }, ref) {
    const { containerRef, chartRef } = useChart<VolumeViewCore, VolumeData>(
      VolumeViewCore,
      null,
      {
        renderMode, isoValue, colorScale, opacity,
        clipX, clipY, clipZ,
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
      setData(d: VolumeData) {
        chartRef.current?.setData(d);
      },
      setRenderMode(mode: NonNullable<VolumeOptions['renderMode']>) {
        chartRef.current?.setRenderMode(mode);
      },
      setIsoValue(val: number) {
        chartRef.current?.setIsoValue(val);
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
