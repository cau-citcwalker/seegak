import {
  type RenderEngine, type RenderLayer, type RenderState,
  type Vec4,
  ortho, hexToVec4,
  Tooltip, throttle,
} from '@seegak/core';
import { BaseChart, type BaseChartOptions } from '../base-chart.js';
import { hitTestGroup } from '../utils/chart-hit-test.js';

// ─── Shaders ───

const BOX_VERT = `#version 300 es
precision highp float;

layout(location = 0) in vec2 a_position;
layout(location = 1) in vec4 a_color;

uniform mat4 u_projection;

out vec4 v_color;

void main() {
  gl_Position = u_projection * vec4(a_position, 0.0, 1.0);
  v_color = a_color;
}
`;

const BOX_FRAG = `#version 300 es
precision highp float;

in vec4 v_color;
out vec4 fragColor;

void main() {
  fragColor = v_color;
}
`;

// ─── Types ───

export interface BoxPlotGroup {
  label: string;
  values: number[];
  color?: string;
  /** Optional: pre-computed statistics (skip calculation) */
  stats?: BoxStats;
}

export interface BoxStats {
  min: number;
  q1: number;
  median: number;
  q3: number;
  max: number;
  outliers: number[];
}

export interface BoxPlotData {
  groups: BoxPlotGroup[];
  title?: string;
  xLabel?: string;
  yLabel?: string;
  /** 'vertical' (default) or 'horizontal' */
  orientation?: 'vertical' | 'horizontal';
}

export interface BoxPlotOptions extends BaseChartOptions {
  boxWidth?: number;
  whiskerWidth?: number;
  showOutliers?: boolean;
  outlierSize?: number;
  defaultColor?: string;
}

// ─── Stats Calculation ───

function computeStats(values: number[]): BoxStats {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;

  if (n === 0) return { min: 0, q1: 0, median: 0, q3: 0, max: 0, outliers: [] };

  const median = percentile(sorted, 0.5);
  const q1 = percentile(sorted, 0.25);
  const q3 = percentile(sorted, 0.75);
  const iqr = q3 - q1;
  const lowerFence = q1 - 1.5 * iqr;
  const upperFence = q3 + 1.5 * iqr;

  const outliers: number[] = [];
  let min = Infinity, max = -Infinity;

  for (const v of sorted) {
    if (v < lowerFence || v > upperFence) {
      outliers.push(v);
    } else {
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }

  if (min === Infinity) min = q1;
  if (max === -Infinity) max = q3;

  return { min, q1, median, q3, max, outliers };
}

function percentile(sorted: number[], p: number): number {
  const idx = p * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

// ─── Render Layer ───

class BoxPlotLayer implements RenderLayer {
  id = 'boxplot';
  order = 10;

  vertexCount = 0;

  render(engine: RenderEngine, state: RenderState): void {
    if (this.vertexCount === 0) return;

    const gl = engine.gl;
    const shader = engine.getShader('boxplot');
    if (!shader) return;

    shader.use();

    // Use pixel-space orthographic projection
    const w = state.viewport.width / state.viewport.pixelRatio;
    const h = state.viewport.height / state.viewport.pixelRatio;
    shader.setUniform('u_projection', {
      type: 'mat4',
      value: ortho(0, w, h, 0, -1, 1), // top-left origin
    });

    const posBuf = engine.buffers.get('boxplot_vertices');
    if (!posBuf) return;

    gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 24, 0); // 6 floats per vertex

    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 24, 8);

    gl.drawArrays(gl.TRIANGLES, 0, this.vertexCount);

    gl.disableVertexAttribArray(0);
    gl.disableVertexAttribArray(1);
  }
}

// ─── Chart ───

const DEFAULT_COLORS = [
  '#FF0B55', '#1f77b4', '#ff7f0e', '#2ca02c', '#d62728',
  '#9467bd', '#8c564b', '#e377c2', '#7f7f7f', '#bcbd22',
  '#17becf', '#aec7e8', '#ffbb78', '#98df8a', '#ff9896',
];

export class BoxPlotChart extends BaseChart {
  private layer: BoxPlotLayer;
  private opts: Required<Pick<BoxPlotOptions, 'boxWidth' | 'whiskerWidth' | 'showOutliers' | 'outlierSize' | 'defaultColor'>>;
  private currentData: BoxPlotData | null = null;
  private currentStats: BoxStats[] = [];
  private tooltip: Tooltip;

  constructor(container: HTMLElement, options: BoxPlotOptions = {}) {
    super(container, { ...options, interactive: false });

    this.opts = {
      boxWidth: options.boxWidth ?? 0.6,
      whiskerWidth: options.whiskerWidth ?? 0.3,
      showOutliers: options.showOutliers ?? true,
      outlierSize: options.outlierSize ?? 3,
      defaultColor: options.defaultColor ?? '#FF0B55',
    };

    this.engine.createShader('boxplot', { vertex: BOX_VERT, fragment: BOX_FRAG });

    this.layer = new BoxPlotLayer();
    this.engine.addLayer(this.layer);

    this.tooltip = new Tooltip(container);
    this.attachHoverHandler();
  }

  private attachHoverHandler(): void {
    const canvas = this.engine.gl.canvas as HTMLCanvasElement;

    const onMove = throttle((e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      this.handleHover(sx, sy);
    }, 32);

    canvas.addEventListener('mousemove', onMove as EventListener);
    canvas.addEventListener('mouseleave', () => this.tooltip.hide());
  }

  private handleHover(sx: number, sy: number): void {
    if (!this.currentData || this.currentStats.length === 0) return;

    const data = this.currentData;
    const isVertical = (data.orientation ?? 'vertical') === 'vertical';
    const area = this.plotArea;

    const groupIdx = hitTestGroup(
      isVertical ? sx : sy,
      isVertical ? area.x : area.y,
      isVertical ? area.width : area.height,
      data.groups.length,
    );

    if (groupIdx < 0) { this.tooltip.hide(); return; }

    const group = data.groups[groupIdx];
    const stats = this.currentStats[groupIdx];

    this.tooltip.show(sx, sy, {
      title: group.label,
      rows: [
        { label: '최대', value: stats.max.toFixed(4) },
        { label: 'Q3',   value: stats.q3.toFixed(4) },
        { label: '중앙값', value: stats.median.toFixed(4) },
        { label: 'Q1',   value: stats.q1.toFixed(4) },
        { label: '최소', value: stats.min.toFixed(4) },
        { label: '이상치', value: `${stats.outliers.length}개` },
        { label: 'N',    value: group.values?.length ?? 'N/A' },
      ],
    });
  }

  update(data: BoxPlotData): void {
    this.currentData = data;
    this.currentStats = data.groups.map(g => g.stats ?? computeStats(g.values));
    this.rebuild();
  }

  destroy(): void {
    this.tooltip.destroy();
    super.destroy();
  }

  private rebuild(): void {
    const data = this.currentData;
    if (!data || data.groups.length === 0) return;

    const isVertical = (data.orientation ?? 'vertical') === 'vertical';
    const area = this.plotArea;

    // Compute stats for all groups
    const allStats = data.groups.map(g => g.stats ?? computeStats(g.values));

    // Find data range
    let dataMin = Infinity, dataMax = -Infinity;
    for (const s of allStats) {
      const minVal = s.outliers.length > 0 ? Math.min(s.min, ...s.outliers) : s.min;
      const maxVal = s.outliers.length > 0 ? Math.max(s.max, ...s.outliers) : s.max;
      if (minVal < dataMin) dataMin = minVal;
      if (maxVal > dataMax) dataMax = maxVal;
    }
    const dataPadding = (dataMax - dataMin) * 0.05 || 1;
    dataMin -= dataPadding;
    dataMax += dataPadding;

    const n = data.groups.length;
    const groupWidth = (isVertical ? area.width : area.height) / n;
    const boxHalfW = groupWidth * this.opts.boxWidth / 2;
    const whiskerHalfW = groupWidth * this.opts.whiskerWidth / 2;

    // Build vertex buffer: position (2) + color (4) = 6 floats per vertex
    const vertices: number[] = [];

    const toPixel = (value: number): number => {
      const t = (value - dataMin) / (dataMax - dataMin);
      if (isVertical) {
        return area.y + area.height * (1 - t); // flip Y
      } else {
        return area.x + area.width * t;
      }
    };

    const pushQuad = (
      x1: number, y1: number, x2: number, y2: number,
      color: Vec4,
    ): void => {
      const c = [color.r, color.g, color.b, color.a];
      // Triangle 1
      vertices.push(x1, y1, ...c);
      vertices.push(x2, y1, ...c);
      vertices.push(x1, y2, ...c);
      // Triangle 2
      vertices.push(x2, y1, ...c);
      vertices.push(x2, y2, ...c);
      vertices.push(x1, y2, ...c);
    };

    for (let i = 0; i < n; i++) {
      const stats = allStats[i];
      const color = hexToVec4(data.groups[i].color ?? DEFAULT_COLORS[i % DEFAULT_COLORS.length]);
      const centerPos = (isVertical ? area.x : area.y) + groupWidth * (i + 0.5);

      const minPx = toPixel(stats.min);
      const q1Px = toPixel(stats.q1);
      const medPx = toPixel(stats.median);
      const q3Px = toPixel(stats.q3);
      const maxPx = toPixel(stats.max);

      if (isVertical) {
        // Box (Q1 to Q3)
        pushQuad(centerPos - boxHalfW, q3Px, centerPos + boxHalfW, q1Px, color);

        // Median line
        const medColor = { r: 1, g: 1, b: 1, a: 1 };
        pushQuad(centerPos - boxHalfW, medPx - 1, centerPos + boxHalfW, medPx + 1, medColor);

        // Lower whisker (vertical line)
        pushQuad(centerPos - 0.5, q1Px, centerPos + 0.5, minPx, color);
        // Upper whisker
        pushQuad(centerPos - 0.5, maxPx, centerPos + 0.5, q3Px, color);

        // Whisker caps
        pushQuad(centerPos - whiskerHalfW, minPx - 0.5, centerPos + whiskerHalfW, minPx + 0.5, color);
        pushQuad(centerPos - whiskerHalfW, maxPx - 0.5, centerPos + whiskerHalfW, maxPx + 0.5, color);

        // Outliers
        if (this.opts.showOutliers) {
          const os = this.opts.outlierSize;
          const outColor = { ...color, a: 0.6 };
          for (const val of stats.outliers) {
            const py = toPixel(val);
            pushQuad(centerPos - os, py - os, centerPos + os, py + os, outColor);
          }
        }
      } else {
        // Horizontal orientation — swap axes
        pushQuad(q1Px, centerPos - boxHalfW, q3Px, centerPos + boxHalfW, color);

        const medColor = { r: 1, g: 1, b: 1, a: 1 };
        pushQuad(medPx - 1, centerPos - boxHalfW, medPx + 1, centerPos + boxHalfW, medColor);

        pushQuad(minPx, centerPos - 0.5, q1Px, centerPos + 0.5, color);
        pushQuad(q3Px, centerPos - 0.5, maxPx, centerPos + 0.5, color);

        pushQuad(minPx - 0.5, centerPos - whiskerHalfW, minPx + 0.5, centerPos + whiskerHalfW, color);
        pushQuad(maxPx - 0.5, centerPos - whiskerHalfW, maxPx + 0.5, centerPos + whiskerHalfW, color);

        if (this.opts.showOutliers) {
          const os = this.opts.outlierSize;
          const outColor = { ...color, a: 0.6 };
          for (const val of stats.outliers) {
            const px = toPixel(val);
            pushQuad(px - os, centerPos - os, px + os, centerPos + os, outColor);
          }
        }
      }
    }

    // Upload to GPU
    const vertexData = new Float32Array(vertices);
    this.engine.setBuffer('boxplot_vertices', { data: vertexData, usage: 'dynamic', size: 6 });
    this.layer.vertexCount = vertices.length / 6;

    // Draw text labels
    const vw = this.engine.viewport.width / this.engine.viewport.pixelRatio;
    const vh = this.engine.viewport.height / this.engine.viewport.pixelRatio;
    this.overlay.resize(vw, vh);
    this.text.resize(vw, vh);

    if (this.showAxes) {
      const labelColor = { r: 0.8, g: 0.8, b: 0.8, a: 1 };
      const axisColor = { r: 0.6, g: 0.7, b: 0.8, a: 1 };

      // Group labels — auto-rotate and truncate when labels overlap
      const FONT = 11;
      const SIN45 = Math.sin(Math.PI / 4);
      const slotW = isVertical ? groupWidth : (isVertical ? area.width : area.height) / n;
      const maxLabelW = data.groups.reduce((m, g) => Math.max(m, this.text.measure(g.label, FONT)), 0);
      const needsRotation = isVertical && maxLabelW > slotW * 0.85;
      // Reserve space for xLabel so group labels don't cover it
      const xLabelReserve = (isVertical && data.xLabel) ? 20 : 0;
      const labelStartOffset = needsRotation ? 12 : 8;
      // Max label px that fits in bottom margin minus xLabel reserve
      const maxFitW = needsRotation
        ? (this.margin.bottom - labelStartOffset - xLabelReserve - 4) / SIN45
        : slotW * 0.92;
      const fitLabel = (text: string): string => {
        if (this.text.measure(text, FONT) <= maxFitW) return text;
        let t = text;
        while (t.length > 1 && this.text.measure(t + '…', FONT) > maxFitW) t = t.slice(0, -1);
        return t + '…';
      };

      for (let i = 0; i < n; i++) {
        const pos = (isVertical ? area.x : area.y) + groupWidth * (i + 0.5);
        if (isVertical) {
          this.text.add(fitLabel(data.groups[i].label), pos, area.y + area.height + labelStartOffset, {
            color: labelColor, fontSize: FONT,
            align: needsRotation ? 'right' : 'center', baseline: 'top',
            rotation: needsRotation ? -Math.PI / 4 : 0,
          });
        } else {
          this.text.add(data.groups[i].label, area.x - 8, pos, {
            color: labelColor, fontSize: FONT, align: 'right', baseline: 'middle',
          });
        }
      }

      // Value axis tick labels
      const tickCount = 6;
      for (let i = 0; i <= tickCount; i++) {
        const val = dataMin + (dataMax - dataMin) * (i / tickCount);
        const px = toPixel(val);
        if (isVertical) {
          this.text.add(val.toFixed(2), area.x - 8, px, {
            color: labelColor, fontSize: 10, align: 'right', baseline: 'middle',
          });
        } else {
          this.text.add(val.toFixed(2), px, area.y + area.height + 8, {
            color: labelColor, fontSize: 10, align: 'center', baseline: 'top',
          });
        }
      }

      // Title
      if (data.title) {
        this.text.add(data.title, area.x + area.width / 2, 10, {
          color: { r: 1, g: 1, b: 1, a: 1 }, fontSize: 14, align: 'center', baseline: 'top',
        });
      }

      if (data.xLabel) {
        // Position xLabel below where group labels end
        const labelEndY = needsRotation
          ? area.y + area.height + labelStartOffset + maxFitW * SIN45 + 4
          : area.y + area.height + 26;
        this.text.add(data.xLabel, area.x + area.width / 2, labelEndY, {
          color: axisColor, fontSize: 12, align: 'center', baseline: 'top',
        });
      }

      if (data.yLabel) {
        this.text.add(data.yLabel, 14, area.y + area.height / 2, {
          color: axisColor, fontSize: 12, align: 'center', baseline: 'middle',
          rotation: -Math.PI / 2,
        });
      }
    }

    this.text.flush();
    this.engine.requestRender();
  }
}
