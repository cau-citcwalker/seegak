import { forwardRef, useEffect, useImperativeHandle, useRef, useState, useCallback } from 'react';
import {
  ScatterChart as ScatterChartCore,
  type ScatterData, type ScatterOptions, type ScatterTooltipData, type ScatterSelectEvent,
} from '@seegak/bio-charts';
import {
  Scatter3DView as Scatter3DViewCore,
  type Scatter3DData,
} from '@seegak/3d';
import type { ColorScale, DataWorker, ToolType, ToolPreset, ActionType } from '@seegak/core';
import { useChart } from './use-chart.js';

export type { ScatterTooltipData, ScatterSelectEvent };

export interface ScatterChartProps {
  data?: ScatterData | null;
  /** Optional Z coordinates for 3D mode */
  z?: Float32Array | null;
  /** Enable 3D toggle button. Requires z data. */
  enable3D?: boolean;
  /** Start in 3D mode. Default: false */
  initial3D?: boolean;
  pointSize?: number;
  opacity?: number;
  colorScale?: ColorScale;
  autoFit?: boolean;
  tooltip?: boolean;
  tooltipFormatter?: ScatterOptions['tooltipFormatter'];
  /** Show toolbar. Default: true */
  toolbar?: boolean;
  toolbarPreset?: ToolPreset;
  defaultTool?: ToolType;
  tools?: ToolType[];
  actions?: ActionType[];
  onSelectPoints?: (e: ScatterSelectEvent) => void;
  /** Show cluster legend panel. Default: true when labels present */
  legend?: boolean;
  legendTitle?: string;
  legendPosition?: 'left' | 'right';
  /** Show axis labels and tick marks. Default: true */
  axes?: boolean;
  xLabel?: string;
  yLabel?: string;
  worker?: DataWorker;
  style?: React.CSSProperties;
  className?: string;
}

export interface ScatterChartHandle {
  instance: ScatterChartCore | null;
  instance3D: Scatter3DViewCore | null;
  is3D: boolean;
  toggle3D: () => void;
  hitTest: (x: number, y: number) => number | null;
}

export const ScatterChart = forwardRef<ScatterChartHandle, ScatterChartProps>(
  function ScatterChart({
    data, z, enable3D, initial3D,
    pointSize, opacity, colorScale, autoFit,
    tooltip, tooltipFormatter,
    toolbar, toolbarPreset, defaultTool, tools, actions, onSelectPoints,
    legend, legendTitle, legendPosition,
    axes, xLabel, yLabel,
    worker,
    style, className,
  }, ref) {

    const can3D = !!(enable3D && z && z.length > 0);
    const [is3D, setIs3D] = useState(can3D && (initial3D ?? false));

    // Container refs
    const wrapperRef = useRef<HTMLDivElement>(null!);
    const container2DRef = useRef<HTMLDivElement>(null!);
    const container3DRef = useRef<HTMLDivElement>(null!);

    // Chart instances
    const chart2DRef = useRef<ScatterChartCore | null>(null);
    const chart3DRef = useRef<Scatter3DViewCore | null>(null);

    // Options ref for stable access
    const optsRef = useRef({
      pointSize, opacity, colorScale, autoFit, tooltip, tooltipFormatter,
      toolbar, toolbarPreset, defaultTool, tools, actions, onSelectPoints,
      legend, legendTitle, legendPosition, axes, xLabel, yLabel,
    });
    optsRef.current = {
      pointSize, opacity, colorScale, autoFit, tooltip, tooltipFormatter,
      toolbar, toolbarPreset, defaultTool, tools, actions, onSelectPoints,
      legend, legendTitle, legendPosition, axes, xLabel, yLabel,
    };

    // Create 2D chart on mount
    useEffect(() => {
      if (!container2DRef.current) return;
      const chart = new ScatterChartCore(container2DRef.current, optsRef.current as unknown as Record<string, unknown>);
      chart2DRef.current = chart;
      return () => { chart.destroy(); chart2DRef.current = null; };
    }, []);

    // Create 3D chart on mount (visibility:hidden keeps dimensions valid)
    useEffect(() => {
      if (!can3D || !container3DRef.current) return;
      const chart = new Scatter3DViewCore(container3DRef.current, {
        pointSize: optsRef.current.pointSize,
        opacity: optsRef.current.opacity,
      });
      chart3DRef.current = chart;
      return () => { chart.destroy(); chart3DRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [can3D]);

    // Update 2D data
    useEffect(() => {
      if (!chart2DRef.current || data == null) return;
      if (worker) {
        void chart2DRef.current.updateAsync(data, worker);
      } else {
        chart2DRef.current.update(data);
      }
    }, [data, worker]);

    // Update 3D data
    useEffect(() => {
      if (!chart3DRef.current || data == null || !z) return;
      chart3DRef.current.setData({ x: data.x, y: data.y, z, labels: data.labels, colors: data.colors });
    }, [data, z]);

    const toggle3D = useCallback(() => {
      if (!can3D) return;
      setIs3D(prev => !prev);
    }, [can3D]);

    useImperativeHandle(ref, () => ({
      get instance() { return chart2DRef.current; },
      get instance3D() { return chart3DRef.current; },
      get is3D() { return is3D; },
      toggle3D,
      hitTest(x: number, y: number) {
        return chart2DRef.current?.hitTest(x, y) ?? null;
      },
    }));

    return (
      <div
        ref={wrapperRef}
        className={className}
        style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden', ...style }}
      >
        {/* 2D chart container */}
        <div
          ref={container2DRef}
          style={{
            position: 'absolute', inset: 0,
            visibility: is3D ? 'hidden' : 'visible',
            zIndex: is3D ? 0 : 1,
          }}
        />

        {/* 3D chart container — always mounted if can3D, hidden via visibility */}
        {can3D && (
          <div
            ref={container3DRef}
            style={{
              position: 'absolute', inset: 0,
              visibility: is3D ? 'visible' : 'hidden',
              zIndex: is3D ? 1 : 0,
            }}
          />
        )}

        {/* 3D toggle button */}
        {can3D && (
          <button
            type="button"
            onClick={toggle3D}
            title={is3D ? 'Switch to 2D' : 'Switch to 3D'}
            style={{
              position: 'absolute',
              top: 8,
              right: 8,
              zIndex: 20,
              padding: '6px 12px',
              border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: 6,
              background: is3D ? 'rgba(59,130,246,0.3)' : 'rgba(20,20,20,0.82)',
              color: is3D ? '#93d2ff' : 'rgba(200,200,200,0.75)',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              backdropFilter: 'blur(6px)',
              transition: 'all 0.15s',
            }}
          >
            {is3D ? '2D' : '3D'}
          </button>
        )}
      </div>
    );
  },
);
