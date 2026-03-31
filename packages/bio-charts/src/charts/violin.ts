import {
  type RenderEngine, type RenderLayer, type RenderState,
  type Vec4,
  ortho, hexToVec4,
  Tooltip, throttle,
} from '@seegak/core';
import { BaseChart, type BaseChartOptions } from '../base-chart.js';

// ─── Shaders ───

const VIOLIN_VERT = `#version 300 es
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

const VIOLIN_FRAG = `#version 300 es
precision highp float;

in vec4 v_color;
out vec4 fragColor;

void main() {
  fragColor = v_color;
}
`;

// ─── Types ───

export interface ViolinPlotGroup {
  label: string;
  /** Raw per-cell values (e.g., log-normalized expression) */
  values: number[] | Float32Array;
  color?: string;
}

export interface ViolinPlotData {
  groups: ViolinPlotGroup[];
  title?: string;
  xLabel?: string;
  yLabel?: string;
}

export interface ViolinPlotOptions extends BaseChartOptions {
  /** Number of KDE sample points along Y axis. Default: 80 */
  kdeSamples?: number;
  /** Max violin half-width as fraction of group slot. Default: 0.42 */
  widthFraction?: number;
  /** Render Q1–Q3 box + median line + whisker overlay. Default: true */
  showBox?: boolean;
  /** Show hover tooltip. Default: true */
  tooltip?: boolean;
}

// ─── Stats & KDE ───

interface ViolinStats {
  min: number;
  q1: number;
  median: number;
  q3: number;
  max: number;
  n: number;
}

function computeStats(values: number[] | Float32Array): ViolinStats {
  const arr = Array.from(values).sort((a, b) => a - b);
  const n = arr.length;
  if (n === 0) return { min: 0, q1: 0, median: 0, q3: 0, max: 0, n: 0 };

  const pct = (p: number): number => {
    const idx = p * (n - 1);
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    return lo === hi ? arr[lo]! : arr[lo]! + (arr[hi]! - arr[lo]!) * (idx - lo);
  };

  return { min: arr[0]!, q1: pct(0.25), median: pct(0.5), q3: pct(0.75), max: arr[n - 1]!, n };
}

function computeKDE(
  values: number[] | Float32Array,
  yMin: number,
  yMax: number,
  nSamples: number,
): Float32Array {
  const arr = values instanceof Float32Array ? values : Float32Array.from(values);
  const n = arr.length;
  const out = new Float32Array(nSamples);
  if (n === 0 || yMax <= yMin) return out;

  // Silverman's rule of thumb
  let mean = 0;
  for (let i = 0; i < n; i++) mean += arr[i]!;
  mean /= n;
  let variance = 0;
  for (let i = 0; i < n; i++) variance += (arr[i]! - mean) ** 2;
  const sigma = Math.sqrt(variance / n) || (yMax - yMin) * 0.1;
  const h = 1.06 * sigma * Math.pow(n, -0.2);
  const norm = 1 / (n * h * Math.sqrt(2 * Math.PI));
  const step = (yMax - yMin) / (nSamples - 1);

  for (let si = 0; si < nSamples; si++) {
    const x = yMin + si * step;
    let sum = 0;
    for (let i = 0; i < n; i++) {
      const u = (x - arr[i]!) / h;
      sum += Math.exp(-0.5 * u * u);
    }
    out[si] = sum * norm;
  }
  return out;
}

// ─── Render Layer ───

class ViolinLayer implements RenderLayer {
  id = 'violin';
  order = 10;
  vertexCount = 0;

  render(engine: RenderEngine, state: RenderState): void {
    if (this.vertexCount === 0) return;

    const gl = engine.gl;
    const shader = engine.getShader('violin');
    if (!shader) return;

    shader.use();

    const w = state.viewport.width / state.viewport.pixelRatio;
    const h = state.viewport.height / state.viewport.pixelRatio;
    shader.setUniform('u_projection', { type: 'mat4', value: ortho(0, w, h, 0, -1, 1) });

    const buf = engine.buffers.get('violin_vertices');
    if (!buf) return;

    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    const STRIDE = 24; // 6 floats × 4 bytes
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, STRIDE, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, STRIDE, 8);

    gl.drawArrays(gl.TRIANGLES, 0, this.vertexCount);

    gl.disableVertexAttribArray(0);
    gl.disableVertexAttribArray(1);
  }
}

// ─── Default Colors ───

const DEFAULT_COLORS = [
  '#FF0B55', '#1f77b4', '#ff7f0e', '#2ca02c', '#d62728',
  '#9467bd', '#8c564b', '#e377c2', '#7f7f7f', '#bcbd22',
  '#17becf', '#aec7e8', '#ffbb78', '#98df8a', '#ff9896',
];

// ─── Chart ───

export class ViolinPlotChart extends BaseChart {
  private layer: ViolinLayer;
  private opts: Required<Pick<ViolinPlotOptions, 'kdeSamples' | 'widthFraction' | 'showBox' | 'tooltip'>>;
  private tooltip: Tooltip | null = null;
  private currentData: ViolinPlotData | null = null;
  private currentStats: ViolinStats[] = [];
  private dataMin = 0;
  private dataMax = 1;

  constructor(container: HTMLElement, options: ViolinPlotOptions = {}) {
    super(container, { ...options, interactive: false });

    this.opts = {
      kdeSamples: options.kdeSamples ?? 80,
      widthFraction: options.widthFraction ?? 0.42,
      showBox: options.showBox !== false,
      tooltip: options.tooltip !== false,
    };

    this.engine.createShader('violin', { vertex: VIOLIN_VERT, fragment: VIOLIN_FRAG });
    this.layer = new ViolinLayer();
    this.engine.addLayer(this.layer);

    if (this.opts.tooltip) {
      this.tooltip = new Tooltip(container);
      this.attachHoverHandler();
    }
  }

  // ─── Hover ───

  private attachHoverHandler(): void {
    const canvas = this.engine.gl.canvas as HTMLCanvasElement;
    const onMove = throttle((e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      this.handleHover(e.clientX - rect.left, e.clientY - rect.top);
    }, 32);
    canvas.addEventListener('mousemove', onMove as EventListener);
    canvas.addEventListener('mouseleave', () => this.tooltip?.hide());
  }

  private handleHover(sx: number, sy: number): void {
    if (!this.currentData || this.currentStats.length === 0) return;
    const area = this.plotArea;
    const n = this.currentData.groups.length;
    const groupWidth = area.width / n;
    const gi = Math.floor((sx - area.x) / groupWidth);
    if (gi < 0 || gi >= n) { this.tooltip?.hide(); return; }

    const group = this.currentData.groups[gi]!;
    const stats = this.currentStats[gi]!;
    this.tooltip?.show(sx, sy, {
      title: group.label,
      rows: [
        { label: 'Max',    value: stats.max.toFixed(4) },
        { label: 'Q3',    value: stats.q3.toFixed(4) },
        { label: 'Median', value: stats.median.toFixed(4) },
        { label: 'Q1',    value: stats.q1.toFixed(4) },
        { label: 'Min',   value: stats.min.toFixed(4) },
        { label: 'N',      value: stats.n.toString() },
      ],
    });
  }

  // ─── Update ───

  update(data: ViolinPlotData): void {
    this.storeData(data);
    this.currentData = data;
    const { groups } = data;
    const n = groups.length;
    if (n === 0) return;

    // Per-group stats + global range
    this.currentStats = groups.map(g => computeStats(g.values));
    let rawMin = Infinity, rawMax = -Infinity;
    for (const s of this.currentStats) {
      if (s.min < rawMin) rawMin = s.min;
      if (s.max > rawMax) rawMax = s.max;
    }
    const pad = (rawMax - rawMin) * 0.05 || 1;
    this.dataMin = rawMin - pad;
    this.dataMax = rawMax + pad;

    const area = this.plotArea;
    const groupWidth = area.width / n;
    const maxHalfW = groupWidth * this.opts.widthFraction;

    const toPixelY = (v: number): number =>
      area.y + area.height * (1 - (v - this.dataMin) / (this.dataMax - this.dataMin));

    // Build vertex buffer — [x, y, r, g, b, a] per vertex, 6 vertices per tri pair
    const vertices: number[] = [];

    const pushV = (x: number, y: number, c: Vec4): void => {
      vertices.push(x, y, c.r, c.g, c.b, c.a);
    };

    const nSamples = this.opts.kdeSamples;
    const step = (this.dataMax - this.dataMin) / (nSamples - 1);

    for (let i = 0; i < n; i++) {
      const group = groups[i]!;
      const cx = area.x + groupWidth * (i + 0.5);
      const color = hexToVec4(group.color ?? DEFAULT_COLORS[i % DEFAULT_COLORS.length]!);
      const fillColor: Vec4 = { ...color, a: 0.75 };

      // KDE — each violin normalized to its own max density
      const densities = computeKDE(group.values, this.dataMin, this.dataMax, nSamples);
      let maxDensity = 0;
      for (let si = 0; si < nSamples; si++) {
        if (densities[si]! > maxDensity) maxDensity = densities[si]!;
      }

      if (maxDensity > 0) {
        for (let si = 0; si < nSamples - 1; si++) {
          const y0 = toPixelY(this.dataMin + si * step);
          const y1 = toPixelY(this.dataMin + (si + 1) * step);
          const w0 = maxHalfW * (densities[si]! / maxDensity);
          const w1 = maxHalfW * (densities[si + 1]! / maxDensity);
          // Trapezoid: two triangles covering the mirrored violin slice
          pushV(cx - w0, y0, fillColor); pushV(cx + w0, y0, fillColor); pushV(cx - w1, y1, fillColor);
          pushV(cx + w0, y0, fillColor); pushV(cx + w1, y1, fillColor); pushV(cx - w1, y1, fillColor);
        }
      }

      // Inner box overlay: whisker + IQR box + median line
      if (this.opts.showBox && this.currentStats[i]!.n > 0) {
        const stats = this.currentStats[i]!;
        const boxHalfW = Math.min(maxHalfW * 0.18, 5);

        const q1Y  = toPixelY(stats.q1);
        const q3Y  = toPixelY(stats.q3);
        const medY = toPixelY(stats.median);
        const minY = toPixelY(stats.min);
        const maxY = toPixelY(stats.max);

        const whiskerC: Vec4 = { r: 1, g: 1, b: 1, a: 0.40 };
        const boxC:     Vec4 = { r: 1, g: 1, b: 1, a: 0.22 };
        const medC:     Vec4 = { r: 1, g: 1, b: 1, a: 0.90 };

        // Whisker (thin vertical line from min to max)
        pushV(cx - 0.5, minY, whiskerC); pushV(cx + 0.5, minY, whiskerC); pushV(cx - 0.5, maxY, whiskerC);
        pushV(cx + 0.5, minY, whiskerC); pushV(cx + 0.5, maxY, whiskerC); pushV(cx - 0.5, maxY, whiskerC);

        // IQR box (Q1–Q3)
        pushV(cx - boxHalfW, q3Y, boxC); pushV(cx + boxHalfW, q3Y, boxC); pushV(cx - boxHalfW, q1Y, boxC);
        pushV(cx + boxHalfW, q3Y, boxC); pushV(cx + boxHalfW, q1Y, boxC); pushV(cx - boxHalfW, q1Y, boxC);

        // Median line
        pushV(cx - boxHalfW, medY - 1.5, medC); pushV(cx + boxHalfW, medY - 1.5, medC); pushV(cx - boxHalfW, medY + 1.5, medC);
        pushV(cx + boxHalfW, medY - 1.5, medC); pushV(cx + boxHalfW, medY + 1.5, medC); pushV(cx - boxHalfW, medY + 1.5, medC);
      }
    }

    this.engine.setBuffer('violin_vertices', { data: new Float32Array(vertices), usage: 'dynamic', size: 6 });
    this.layer.vertexCount = vertices.length / 6;

    // ── Labels ──
    const vw = this.engine.viewport.width / this.engine.viewport.pixelRatio;
    const vh = this.engine.viewport.height / this.engine.viewport.pixelRatio;
    this.overlay.resize(vw, vh);
    this.text.resize(vw, vh);

    if (this.showAxes) {
      const labelColor = { r: 0.8, g: 0.8, b: 0.8, a: 1 };
      const axisColor  = { r: 0.6, g: 0.7, b: 0.8, a: 1 };
      const FONT = 11;

      // Group labels (X axis) — auto-rotate when crowded
      const maxLabelW = groups.reduce((m, g) => Math.max(m, this.text.measure(g.label, FONT)), 0);
      const needsRotation = maxLabelW > groupWidth * 0.85;
      const SIN45 = Math.sin(Math.PI / 4);
      const maxFitW = needsRotation
        ? (this.margin.bottom - 12) / SIN45
        : groupWidth * 0.92;
      const fitLabel = (t: string): string => {
        if (this.text.measure(t, FONT) <= maxFitW) return t;
        let s = t;
        while (s.length > 1 && this.text.measure(s + '…', FONT) > maxFitW) s = s.slice(0, -1);
        return s + '…';
      };

      for (let i = 0; i < n; i++) {
        const x = area.x + groupWidth * (i + 0.5);
        this.text.add(fitLabel(groups[i]!.label), x, area.y + area.height + 8, {
          color: labelColor, fontSize: FONT,
          align: needsRotation ? 'right' : 'center',
          baseline: needsRotation ? 'middle' : 'top',
          rotation: needsRotation ? -Math.PI / 4 : 0,
        });
      }

      // Y axis tick labels
      const tickCount = 6;
      for (let ti = 0; ti <= tickCount; ti++) {
        const v = this.dataMin + (this.dataMax - this.dataMin) * (ti / tickCount);
        const py = toPixelY(v);
        this.text.add(v.toFixed(2), area.x - 8, py, {
          color: labelColor, fontSize: 10, align: 'right', baseline: 'middle',
        });
      }

      // Axis labels
      if (data.xLabel) {
        const xLabelY = needsRotation
          ? area.y + area.height + 12 + maxFitW * SIN45 + 4
          : area.y + area.height + 26;
        this.text.add(data.xLabel, area.x + area.width / 2, xLabelY, {
          color: axisColor, fontSize: 12, align: 'center', baseline: 'top',
        });
      }

      if (data.yLabel) {
        this.text.add(data.yLabel, 14, area.y + area.height / 2, {
          color: axisColor, fontSize: 12, align: 'center', baseline: 'middle',
          rotation: -Math.PI / 2,
        });
      }

      // Title
      if (data.title) {
        this.text.add(data.title, area.x + area.width / 2, 10, {
          color: { r: 1, g: 1, b: 1, a: 1 }, fontSize: 14,
          align: 'center', baseline: 'top',
        });
      }
    }

    this.drawGrid();
    this.text.flush();
    this.engine.requestRender();
  }

  // ─── Resize ───

  resize(): void {
    super.resize();
    if (this.currentData) this.update(this.currentData);
  }

  // ─── Destroy ───

  destroy(): void {
    this.tooltip?.destroy();
    super.destroy();
  }
}
