import {
  type RenderEngine, type RenderLayer, type RenderState,
  type ColorScale, type Vec4,
  ortho, hexToVec4, sampleColorScale,
  Tooltip, throttle,
  VIRIDIS,
} from '@seegak/core';
import { BaseChart, type BaseChartOptions } from '../base-chart.js';

// ─── Shaders ───
// Simple pre-computed RGBA color per vertex — no texture needed.
// All color math (colorscale, cluster colors) is done CPU-side.

const HEATMAP_VERT = `#version 300 es
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

const HEATMAP_FRAG = `#version 300 es
precision highp float;

in vec4 v_color;
out vec4 fragColor;

void main() {
  fragColor = v_color;
}
`;

// ─── Types ───

export interface HeatmapData {
  /** Column labels — genes / features (X axis) */
  genes: string[];
  /**
   * Row labels — cell IDs, cluster names, or sample names (Y axis).
   * For large cell-level data, use empty strings to hide individual labels
   * and rely on `rowClusters` for group labels.
   */
  rows: string[];
  /**
   * Row-major expression matrix [row][gene].
   * Length = rows.length × genes.length.
   */
  expression: Float32Array;
  /**
   * Optional cluster assignment per row (must be same length as `rows`).
   * When provided, rows should be sorted by cluster.
   * Draws colored group bars on the left and cluster name labels.
   */
  rowClusters?: string[];
  /** Hex color per cluster name. Required when `rowClusters` is set. */
  clusterColors?: Record<string, string>;
  title?: string;
}

export type HeatmapNormalize = 'global' | 'gene' | 'none';

export interface HeatmapOptions extends BaseChartOptions {
  /** Color scale for expression values. Default: VIRIDIS */
  colorScale?: ColorScale;
  /**
   * Value normalization strategy.
   * - 'global' — min/max across the whole matrix (default)
   * - 'gene'   — each column normalized independently (shows relative patterns)
   * - 'none'   — values used as-is, assumed to be in [0, 1]
   */
  normalize?: HeatmapNormalize;
  /** Show hover tooltip. Default: true */
  tooltip?: boolean;
}

// ─── Render Layer ───

class HeatmapLayer implements RenderLayer {
  id = 'heatmap';
  order = 10;
  vertexCount = 0;

  render(engine: RenderEngine, state: RenderState): void {
    if (this.vertexCount === 0) return;

    const gl = engine.gl;
    const shader = engine.getShader('heatmap');
    if (!shader) return;

    shader.use();

    const w = state.viewport.width / state.viewport.pixelRatio;
    const h = state.viewport.height / state.viewport.pixelRatio;
    shader.setUniform('u_projection', { type: 'mat4', value: ortho(0, w, h, 0, -1, 1) });

    const buf = engine.buffers.get('heatmap_vertices');
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

// ─── Chart ───

export class HeatmapChart extends BaseChart {
  private layer: HeatmapLayer;
  private opts: Required<Pick<HeatmapOptions, 'colorScale' | 'normalize' | 'tooltip'>>;
  private tooltip: Tooltip | null = null;
  private currentData: HeatmapData | null = null;

  // Cached layout for hit testing
  private _plotArea = { x: 0, y: 0, width: 0, height: 0 };

  constructor(container: HTMLElement, options: HeatmapOptions = {}) {
    const margin = { top: 40, right: 160, bottom: 90, left: 160, ...options.margin };
    super(container, { ...options, interactive: false, toolbar: false, margin });

    this.opts = {
      colorScale: options.colorScale ?? VIRIDIS,
      normalize: options.normalize ?? 'global',
      tooltip: options.tooltip !== false,
    };

    this.engine.createShader('heatmap', { vertex: HEATMAP_VERT, fragment: HEATMAP_FRAG });
    this.layer = new HeatmapLayer();
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
    if (!this.currentData) return;
    const area = this._plotArea;
    const { genes, rows, expression, rowClusters } = this.currentData;

    const gi = Math.floor((sx - area.x) / (area.width / genes.length));
    const ri = Math.floor((sy - area.y) / (area.height / rows.length));

    if (gi < 0 || gi >= genes.length || ri < 0 || ri >= rows.length) {
      this.tooltip?.hide();
      return;
    }

    const idx = ri * genes.length + gi;
    const rowLabel = rowClusters?.[ri] ?? rows[ri];

    this.tooltip?.show(sx, sy, {
      title: `${genes[gi]}`,
      rows: [
        { label: '세포/클러스터', value: rowLabel ?? '' },
        { label: '발현량', value: expression[idx]!.toFixed(4) },
      ],
    });
  }

  // ─── Normalization ───

  private normalizeGlobal(expr: Float32Array): Float32Array {
    let min = Infinity, max = -Infinity;
    for (let i = 0; i < expr.length; i++) {
      if (expr[i] < min) min = expr[i];
      if (expr[i] > max) max = expr[i];
    }
    const range = max - min || 1;
    const out = new Float32Array(expr.length);
    for (let i = 0; i < expr.length; i++) out[i] = (expr[i] - min) / range;
    return out;
  }

  private normalizePerGene(expr: Float32Array, R: number, G: number): Float32Array {
    const out = new Float32Array(expr.length);
    for (let gi = 0; gi < G; gi++) {
      let min = Infinity, max = -Infinity;
      for (let ri = 0; ri < R; ri++) {
        const v = expr[ri * G + gi];
        if (v < min) min = v;
        if (v > max) max = v;
      }
      const range = max - min || 1;
      for (let ri = 0; ri < R; ri++) {
        const idx = ri * G + gi;
        out[idx] = (expr[idx] - min) / range;
      }
    }
    return out;
  }

  // ─── Update ───

  update(data: HeatmapData): void {
    this.currentData = data;
    const { genes, rows, expression, rowClusters, clusterColors } = data;
    const G = genes.length;
    const R = rows.length;

    const area = this.plotArea;
    this._plotArea = { ...area };
    const cellW = area.width / G;
    const cellH = area.height / R;

    // Normalize
    let normExpr: Float32Array;
    if (this.opts.normalize === 'gene') {
      normExpr = this.normalizePerGene(expression, R, G);
    } else if (this.opts.normalize === 'none') {
      normExpr = expression;
    } else {
      normExpr = this.normalizeGlobal(expression);
    }

    // ── Build vertex buffer ──
    // Layout: [x, y, r, g, b, a] per vertex, 6 vertices per quad
    const vertices: number[] = [];

    const pushQuad = (x1: number, y1: number, x2: number, y2: number, c: Vec4): void => {
      vertices.push(x1, y1, c.r, c.g, c.b, c.a,  x2, y1, c.r, c.g, c.b, c.a,  x1, y2, c.r, c.g, c.b, c.a);
      vertices.push(x2, y1, c.r, c.g, c.b, c.a,  x2, y2, c.r, c.g, c.b, c.a,  x1, y2, c.r, c.g, c.b, c.a);
    };

    // Expression matrix cells
    for (let ri = 0; ri < R; ri++) {
      for (let gi = 0; gi < G; gi++) {
        const color = sampleColorScale(this.opts.colorScale, normExpr[ri * G + gi]!);
        pushQuad(
          area.x + gi * cellW,       area.y + ri * cellH,
          area.x + (gi + 1) * cellW, area.y + (ri + 1) * cellH,
          color,
        );
      }
    }

    // Cluster color bars (left side of plot area)
    if (rowClusters && clusterColors) {
      const barW = 8;
      const barX = area.x - barW - 4;
      let start = 0;
      while (start < R) {
        const cluster = rowClusters[start]!;
        let end = start + 1;
        while (end < R && rowClusters[end] === cluster) end++;
        pushQuad(
          barX, area.y + start * cellH,
          barX + barW, area.y + end * cellH,
          hexToVec4(clusterColors[cluster] ?? '#888888'),
        );
        start = end;
      }
    }

    // Color bar (right side) — 120 thin colored quads forming the gradient
    if (this.showAxes) {
      const CB_X = area.x + area.width + 20;
      const CB_Y = area.y;
      const CB_W = 14;
      const CB_H = Math.min(area.height * 0.6, 140);
      const STEPS = 120;
      for (let i = 0; i < STEPS; i++) {
        const t0 = i / STEPS;
        const t1 = (i + 1) / STEPS;
        const y0 = CB_Y + CB_H * (1 - t1);
        const y1 = CB_Y + CB_H * (1 - t0);
        pushQuad(CB_X, y0, CB_X + CB_W, y1, sampleColorScale(this.opts.colorScale, t0));
      }
    }

    this.engine.setBuffer('heatmap_vertices', { data: new Float32Array(vertices), usage: 'dynamic', size: 6 });
    this.layer.vertexCount = vertices.length / 6;

    // ── Labels ──
    const vw = this.engine.viewport.width / this.engine.viewport.pixelRatio;
    const vh = this.engine.viewport.height / this.engine.viewport.pixelRatio;
    this.text.resize(vw, vh);

    if (this.showAxes) {
      const labelColor = { r: 0.8, g: 0.8, b: 0.8, a: 1 };
      const axisColor  = { r: 0.6, g: 0.7, b: 0.8, a: 1 };
      const FONT = 11;

      // ── Gene labels (X axis, bottom) — rotate if crowded ──
      const maxGeneW = genes.reduce((m, g) => Math.max(m, this.text.measure(g, FONT)), 0);
      const needsRotation = maxGeneW > cellW * 0.85;
      const SIN45 = Math.sin(Math.PI / 4);
      const maxFitW = needsRotation
        ? (this.margin.bottom - 10) / SIN45
        : cellW * 0.92;
      const fitLabel = (t: string): string => {
        if (this.text.measure(t, FONT) <= maxFitW) return t;
        let s = t;
        while (s.length > 1 && this.text.measure(s + '…', FONT) > maxFitW) s = s.slice(0, -1);
        return s + '…';
      };

      for (let gi = 0; gi < G; gi++) {
        const x = area.x + (gi + 0.5) * cellW;
        this.text.add(fitLabel(genes[gi]!), x, area.y + area.height + 8, {
          color: labelColor, fontSize: FONT,
          align: needsRotation ? 'right' : 'center',
          baseline: needsRotation ? 'middle' : 'top',
          rotation: needsRotation ? -Math.PI / 4 : 0,
        });
      }

      // ── Row labels (Y axis, left) ──
      if (rowClusters && clusterColors) {
        // Show cluster group labels centered in each group
        let start = 0;
        while (start < R) {
          const cluster = rowClusters[start]!;
          let end = start + 1;
          while (end < R && rowClusters[end] === cluster) end++;
          const midY = area.y + (start + end) / 2 * cellH;
          this.text.add(cluster, area.x - 16, midY, {
            color: labelColor, fontSize: FONT, align: 'right', baseline: 'middle',
          });
          start = end;
        }
      } else if (R <= 60) {
        // Show individual row labels when there aren't too many
        for (let ri = 0; ri < R; ri++) {
          if (!rows[ri]) continue;
          const y = area.y + (ri + 0.5) * cellH;
          this.text.add(rows[ri]!, area.x - 8, y, {
            color: labelColor, fontSize: FONT, align: 'right', baseline: 'middle',
          });
        }
      }

      // ── Color bar labels ──
      const CB_X = area.x + area.width + 20;
      const CB_Y = area.y;
      const CB_W = 14;
      const CB_H = Math.min(area.height * 0.6, 140);

      // Min/max values
      let minE = Infinity, maxE = -Infinity;
      for (let i = 0; i < expression.length; i++) {
        if (expression[i]! < minE) minE = expression[i]!;
        if (expression[i]! > maxE) maxE = expression[i]!;
      }

      this.text.add(maxE.toFixed(2), CB_X + CB_W + 4, CB_Y, {
        color: axisColor, fontSize: 10, align: 'left', baseline: 'top',
      });
      this.text.add(minE.toFixed(2), CB_X + CB_W + 4, CB_Y + CB_H, {
        color: axisColor, fontSize: 10, align: 'left', baseline: 'bottom',
      });

      // Color bar vertical label
      const midCB = CB_Y + CB_H / 2;
      const normLabel = this.opts.normalize === 'gene' ? '발현 (유전자별 정규화)' : '발현량';
      this.text.add(normLabel, CB_X - 4, midCB, {
        color: axisColor, fontSize: 10, align: 'center', baseline: 'bottom',
        rotation: -Math.PI / 2,
      });

      // Title
      if (data.title) {
        this.text.add(data.title, area.x + area.width / 2, 10, {
          color: { r: 1, g: 1, b: 1, a: 1 }, fontSize: 14,
          align: 'center', baseline: 'top',
        });
      }
    }

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
