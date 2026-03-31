import {
  type RenderEngine, type RenderLayer, type RenderState,
  type ColorScale,
  ortho, colorScaleToTexture,
  Tooltip, throttle,
  VIRIDIS,
} from '@seegak/core';
import { BaseChart, type BaseChartOptions } from '../base-chart.js';

// ─── Shaders ───

const DOT_VERT = `#version 300 es
precision highp float;

// Interleaved buffer: [x, y, normValue, fraction]
layout(location = 0) in vec2 a_position;
layout(location = 1) in float a_value;    // normalized mean expression (0-1)
layout(location = 2) in float a_fraction; // fraction of cells expressing (0-1)

uniform mat4 u_projection;
uniform float u_maxRadius; // max dot radius in device pixels

out float v_value;
out float v_fraction;

void main() {
  gl_Position = u_projection * vec4(a_position, 0.0, 1.0);
  // diameter = maxRadius * 2 * fraction, minimum 2px so dots are always visible
  gl_PointSize = max(2.0, u_maxRadius * 2.0 * a_fraction);
  v_value = a_value;
  v_fraction = a_fraction;
}
`;

const DOT_FRAG = `#version 300 es
precision highp float;

in float v_value;
in float v_fraction;

uniform sampler2D u_colorScale;
uniform float u_opacity;

out vec4 fragColor;

void main() {
  vec2 cxy = 2.0 * gl_PointCoord - 1.0;
  float r = dot(cxy, cxy);
  if (r > 1.0) discard;

  float alpha = 1.0 - smoothstep(0.7, 1.0, r);
  vec4 color = texture(u_colorScale, vec2(v_value, 0.5));
  fragColor = vec4(color.rgb, color.a * alpha * u_opacity);
}
`;

// ─── Types ───

export interface DotPlotData {
  /** Gene names — X axis */
  genes: string[];
  /** Cluster / cell-type names — Y axis */
  clusters: string[];
  /**
   * Row-major matrix [cluster][gene].
   * Length = clusters.length × genes.length.
   * Mean expression value for each (cluster, gene) pair (raw counts or log-normalized).
   */
  meanExpression: Float32Array;
  /**
   * Row-major matrix [cluster][gene].
   * Fraction of cells in the cluster that express the gene (0–1).
   */
  fractionExpressing: Float32Array;
  title?: string;
}

export interface DotPlotOptions extends BaseChartOptions {
  /** Max dot radius in CSS px. Default: 14 */
  maxRadius?: number;
  /** Color scale for mean expression. Default: VIRIDIS */
  colorScale?: ColorScale;
  /** Global dot opacity. Default: 0.9 */
  opacity?: number;
  /** Show hover tooltip. Default: true */
  tooltip?: boolean;
}

// ─── Render Layer ───

class DotLayer implements RenderLayer {
  id = 'dot';
  order = 10;
  pointCount = 0;
  maxRadius = 14; // CSS px — converted to device px in render()

  render(engine: RenderEngine, state: RenderState): void {
    if (this.pointCount === 0) return;

    const gl = engine.gl;
    const shader = engine.getShader('dot');
    if (!shader) return;

    shader.use();

    const w = state.viewport.width / state.viewport.pixelRatio;
    const h = state.viewport.height / state.viewport.pixelRatio;
    shader.setUniform('u_projection', { type: 'mat4', value: ortho(0, w, h, 0, -1, 1) });
    shader.setUniform('u_maxRadius', { type: 'float', value: this.maxRadius * state.viewport.pixelRatio });

    const buf = engine.buffers.get('dot_vertices');
    if (!buf) return;

    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    const STRIDE = 16; // 4 floats × 4 bytes
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, STRIDE, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 1, gl.FLOAT, false, STRIDE, 8);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 1, gl.FLOAT, false, STRIDE, 12);

    const texUnit = engine.textures.bind('dot_colorscale');
    if (texUnit >= 0) {
      shader.setUniform('u_colorScale', { type: 'sampler2D', value: texUnit });
    }

    gl.drawArrays(gl.POINTS, 0, this.pointCount);

    gl.disableVertexAttribArray(0);
    gl.disableVertexAttribArray(1);
    gl.disableVertexAttribArray(2);
  }
}

// ─── Chart ───

export class DotPlotChart extends BaseChart {
  private layer: DotLayer;
  private opts: Required<Pick<DotPlotOptions, 'maxRadius' | 'colorScale' | 'opacity' | 'tooltip'>>;
  private tooltip: Tooltip | null = null;
  private currentData: DotPlotData | null = null;

  constructor(container: HTMLElement, options: DotPlotOptions = {}) {
    // Default margins: left for cluster labels, bottom for gene names, right for color bar
    const margin = { top: 40, right: 140, bottom: 90, left: 140, ...options.margin };
    super(container, { ...options, interactive: false, margin });

    this.opts = {
      maxRadius: options.maxRadius ?? 14,
      colorScale: options.colorScale ?? VIRIDIS,
      opacity: options.opacity ?? 0.9,
      tooltip: options.tooltip !== false,
    };

    this.engine.createShader('dot', { vertex: DOT_VERT, fragment: DOT_FRAG });

    this.engine.textures.createLUT('dot_colorscale', colorScaleToTexture(this.opts.colorScale));

    const shader = this.engine.getShader('dot')!;
    shader.use();
    shader.setUniform('u_opacity', { type: 'float', value: this.opts.opacity });

    this.layer = new DotLayer();
    this.layer.maxRadius = this.opts.maxRadius;
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
    const area = this.plotArea;
    const { genes, clusters } = this.currentData;

    const gi = Math.floor((sx - area.x) / (area.width / genes.length));
    const ci = Math.floor((sy - area.y) / (area.height / clusters.length));

    if (gi < 0 || gi >= genes.length || ci < 0 || ci >= clusters.length) {
      this.tooltip?.hide();
      return;
    }

    const idx = ci * genes.length + gi;
    const expr = this.currentData.meanExpression[idx];
    const frac = this.currentData.fractionExpressing[idx];

    this.tooltip?.show(sx, sy, {
      title: `${clusters[ci]}  ×  ${genes[gi]}`,
      rows: [
        { label: 'Mean Expression', value: expr.toFixed(4) },
        { label: 'Fraction Expressing', value: `${(frac * 100).toFixed(1)}%` },
      ],
    });
  }

  // ─── Update ───

  update(data: DotPlotData): void {
    this.storeData(data);
    this.currentData = data;
    const { genes, clusters, meanExpression, fractionExpressing } = data;
    const G = genes.length;
    const C = clusters.length;
    const n = G * C;

    const area = this.plotArea;
    const cellW = area.width / G;
    const cellH = area.height / C;

    // Normalize mean expression to [0, 1] for colorscale mapping
    let minE = Infinity, maxE = -Infinity;
    for (let i = 0; i < n; i++) {
      if (meanExpression[i] < minE) minE = meanExpression[i];
      if (meanExpression[i] > maxE) maxE = meanExpression[i];
    }
    const rangeE = maxE - minE || 1;

    // Build interleaved vertex buffer: [x, y, normValue, fraction]
    const vertices = new Float32Array(n * 4);
    for (let ci = 0; ci < C; ci++) {
      for (let gi = 0; gi < G; gi++) {
        const idx = ci * G + gi;
        const x = area.x + (gi + 0.5) * cellW;
        const y = area.y + (ci + 0.5) * cellH;
        vertices[idx * 4 + 0] = x;
        vertices[idx * 4 + 1] = y;
        vertices[idx * 4 + 2] = (meanExpression[idx] - minE) / rangeE;
        vertices[idx * 4 + 3] = fractionExpressing[idx];
      }
    }

    this.engine.setBuffer('dot_vertices', { data: vertices, usage: 'dynamic', size: 4 });
    this.layer.pointCount = n;

    // Labels & axes
    const vw = this.engine.viewport.width / this.engine.viewport.pixelRatio;
    const vh = this.engine.viewport.height / this.engine.viewport.pixelRatio;
    this.overlay.resize(vw, vh);
    this.text.resize(vw, vh);

    if (this.showAxes) {
      const labelColor = { r: 0.8, g: 0.8, b: 0.8, a: 1 };
      const axisColor = { r: 0.6, g: 0.7, b: 0.8, a: 1 };
      const FONT = 11;

      // ── Gene labels (X axis, bottom) — rotate if crowded ──
      const maxGeneW = genes.reduce((m, g) => Math.max(m, this.text.measure(g, FONT)), 0);
      const needsRotation = maxGeneW > cellW * 0.85;
      const SIN45 = Math.sin(Math.PI / 4);
      const maxFitW = needsRotation
        ? (this.margin.bottom - 8 - 4) / SIN45
        : cellW * 0.92;

      const fitLabel = (text: string): string => {
        if (this.text.measure(text, FONT) <= maxFitW) return text;
        let t = text;
        while (t.length > 1 && this.text.measure(t + '…', FONT) > maxFitW) t = t.slice(0, -1);
        return t + '…';
      };

      for (let gi = 0; gi < G; gi++) {
        const x = area.x + (gi + 0.5) * cellW;
        if (needsRotation) {
          this.text.add(fitLabel(genes[gi]), x, area.y + area.height + 8, {
            color: labelColor, fontSize: FONT,
            align: 'right', baseline: 'middle',
            rotation: -Math.PI / 4,
          });
        } else {
          this.text.add(fitLabel(genes[gi]), x, area.y + area.height + 8, {
            color: labelColor, fontSize: FONT,
            align: 'center', baseline: 'top',
          });
        }
      }

      // ── Cluster labels (Y axis, left) ──
      for (let ci = 0; ci < C; ci++) {
        const y = area.y + (ci + 0.5) * cellH;
        this.text.add(clusters[ci], area.x - 8, y, {
          color: labelColor, fontSize: FONT,
          align: 'right', baseline: 'middle',
        });
      }

      // ── Color bar (right side) — gradient + min/max labels ──
      this.drawColorBar(area, minE, maxE, axisColor);

      // ── Legend: dot size scale ──
      this.drawSizeLegend(area, axisColor);

      // ── Title ──
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

  // ─── Color Bar (right side) ───

  private drawColorBar(
    area: { x: number; y: number; width: number; height: number },
    minE: number,
    maxE: number,
    axisColor: { r: number; g: number; b: number; a: number },
  ): void {
    // Draw on the annotation overlay canvas using 2D context
    const ctx = this.overlay.canvas.getContext('2d');
    if (!ctx) return;

    const FONT = 10;
    const barX = area.x + area.width + 20;
    const barY = area.y;
    const barW = 12;
    const barH = Math.min(area.height * 0.5, 120);

    // Gradient fill
    const grad = ctx.createLinearGradient(0, barY + barH, 0, barY);
    const scale = this.opts.colorScale;
    for (const stop of scale.stops) {
      const { r, g, b, a } = stop.color;
      grad.addColorStop(
        stop.position,
        `rgba(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)},${a})`,
      );
    }
    ctx.fillStyle = grad;
    ctx.fillRect(barX, barY, barW, barH);

    // Border
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 0.5;
    ctx.strokeRect(barX, barY, barW, barH);

    // Labels
    ctx.fillStyle = `rgba(${Math.round(axisColor.r * 255)},${Math.round(axisColor.g * 255)},${Math.round(axisColor.b * 255)},1)`;
    ctx.font = `${FONT}px sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(maxE.toFixed(2), barX + barW + 4, barY);
    ctx.textBaseline = 'bottom';
    ctx.fillText(minE.toFixed(2), barX + barW + 4, barY + barH);

    // Label
    ctx.save();
    ctx.translate(barX - 4, barY + barH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('Mean Expression', 0, 0);
    ctx.restore();
  }

  // ─── Size Legend ───

  private drawSizeLegend(
    area: { x: number; y: number; width: number; height: number },
    axisColor: { r: number; g: number; b: number; a: number },
  ): void {
    const ctx = this.overlay.canvas.getContext('2d');
    if (!ctx) return;

    const FONT = 10;
    const legendX = area.x + area.width + 20;
    const legendY = area.y + Math.min(area.height * 0.5, 120) + 30;
    const r = this.opts.maxRadius;

    const fracs = [1.0, 0.5, 0.25];
    let offsetY = legendY;

    ctx.fillStyle = `rgba(${Math.round(axisColor.r * 255)},${Math.round(axisColor.g * 255)},${Math.round(axisColor.b * 255)},1)`;
    ctx.font = `${FONT}px sans-serif`;
    ctx.textAlign = 'left';

    ctx.textBaseline = 'middle';
    ctx.fillText('Fraction Expressing', legendX, offsetY - 12);

    for (const frac of fracs) {
      const dotR = r * frac;
      ctx.beginPath();
      ctx.arc(legendX + r, offsetY + dotR, dotR, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(160,160,180,0.7)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.4)';
      ctx.lineWidth = 0.5;
      ctx.stroke();

      ctx.fillStyle = `rgba(${Math.round(axisColor.r * 255)},${Math.round(axisColor.g * 255)},${Math.round(axisColor.b * 255)},1)`;
      ctx.textBaseline = 'middle';
      ctx.fillText(`${(frac * 100).toFixed(0)}%`, legendX + r * 2 + 6, offsetY + dotR);

      offsetY += dotR * 2 + 8;
    }
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
