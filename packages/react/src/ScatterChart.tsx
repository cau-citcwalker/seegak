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
  toolbar?: boolean;
  toolbarPreset?: ToolPreset;
  defaultTool?: ToolType;
  tools?: ToolType[];
  actions?: ActionType[];
  onSelectPoints?: (e: ScatterSelectEvent) => void;
  legend?: boolean;
  legendTitle?: string;
  legendPosition?: 'left' | 'right';
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

    const containerRef = useRef<HTMLDivElement>(null!);
    const chart2DRef = useRef<ScatterChartCore | null>(null);
    const chart3DRef = useRef<Scatter3DViewCore | null>(null);

    // Stable refs for latest data/z/options
    const dataRef = useRef(data);
    dataRef.current = data;
    const zRef = useRef(z);
    zRef.current = z;
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

    // Destroy whichever chart currently exists and clear the container
    const destroyCurrent = useCallback(() => {
      if (chart2DRef.current) { chart2DRef.current.destroy(); chart2DRef.current = null; }
      if (chart3DRef.current) { chart3DRef.current.destroy(); chart3DRef.current = null; }
      if (containerRef.current) containerRef.current.innerHTML = '';
    }, []);

    // Create the appropriate chart for the current mode
    const createChart = useCallback((mode3D: boolean) => {
      if (!containerRef.current) return;
      destroyCurrent();

      if (mode3D) {
        const chart = new Scatter3DViewCore(containerRef.current, {
          pointSize: optsRef.current.pointSize,
          opacity: optsRef.current.opacity,
        });
        chart3DRef.current = chart;
        const d = dataRef.current;
        const zz = zRef.current;
        if (d && zz) {
          chart.setData({ x: d.x, y: d.y, z: zz, labels: d.labels, colors: d.colors });
        }
        // Force render after layout settles — fixes blank screen on 2D→3D toggle
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (chart3DRef.current === chart) {
              chart.forceRender();
            }
          });
        });
      } else {
        const chart = new ScatterChartCore(containerRef.current, optsRef.current as unknown as Record<string, unknown>);
        chart2DRef.current = chart;
        const d = dataRef.current;
        if (d) {
          if (worker) void chart.updateAsync(d, worker);
          else chart.update(d);
        }
      }
    }, [destroyCurrent, worker]);

    // Create chart on mount
    useEffect(() => {
      createChart(is3D);
      return destroyCurrent;
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Re-create chart when toggling mode
    const prevModeRef = useRef(is3D);
    useEffect(() => {
      if (prevModeRef.current === is3D) return;
      prevModeRef.current = is3D;
      createChart(is3D);
    }, [is3D, createChart]);

    // Update data when it changes (without re-creating chart)
    useEffect(() => {
      if (data == null) return;
      if (is3D) {
        if (!z || z.length === 0) {
          // No z data available — force switch to 2D
          setIs3D(false);
          return;
        }
        if (chart3DRef.current) {
          chart3DRef.current.setData({ x: data.x, y: data.y, z, labels: data.labels, colors: data.colors });
        }
      } else {
        if (chart2DRef.current) {
          if (worker) void chart2DRef.current.updateAsync(data, worker);
          else chart2DRef.current.update(data);
        }
      }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [data, z, worker]);

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
      <div style={{ width: '100%', height: '100%', position: 'relative', ...style }} className={className}>
        <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

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
