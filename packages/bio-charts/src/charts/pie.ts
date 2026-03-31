import {
  type RenderEngine, type RenderLayer, type RenderState,
  type Vec4,
  ortho, hexToVec4,
  Tooltip, throttle,
} from '@seegak/core';
import { BaseChart, type BaseChartOptions } from '../base-chart.js';
import { hitTestPieSlice } from '../utils/chart-hit-test.js';

// ─── Shaders ───

const PIE_VERT = `#version 300 es
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

const PIE_FRAG = `#version 300 es
precision highp float;

in vec4 v_color;
out vec4 fragColor;

void main() {
  fragColor = v_color;
}
`;

// ─── Types ───

export interface PieSlice {
  label: string;
  value: number;
  color?: string;
}

export interface PieChartData {
  slices: PieSlice[];
  title?: string;
  /** Inner radius ratio for donut charts (0 = full pie, 0.5 = donut) */
  innerRadius?: number;
}

export interface PieChartOptions extends BaseChartOptions {
  showLabels?: boolean;
  showPercentage?: boolean;
  /** Slices below this percentage are grouped into "Others". Default: 2 */
  groupThreshold?: number;
  /** Labels are hidden for slices below this percentage. Default: 3 */
  labelThreshold?: number;
}

// ─── Render Layer ───

class PieLayer implements RenderLayer {
  id = 'pie';
  order = 10;
  vertexCount = 0;

  render(engine: RenderEngine, state: RenderState): void {
    if (this.vertexCount === 0) return;
    const gl = engine.gl;
    const shader = engine.getShader('pie');
    if (!shader) return;

    shader.use();
    const w = state.viewport.width / state.viewport.pixelRatio;
    const h = state.viewport.height / state.viewport.pixelRatio;
    shader.setUniform('u_projection', { type: 'mat4', value: ortho(0, w, h, 0, -1, 1) });

    const buf = engine.buffers.get('pie_vertices');
    if (!buf) return;

    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 24, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 24, 8);

    gl.drawArrays(gl.TRIANGLES, 0, this.vertexCount);

    gl.disableVertexAttribArray(0);
    gl.disableVertexAttribArray(1);
  }
}

// ─── Chart ───

const DEFAULT_COLORS = [
  '#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd',
  '#8c564b', '#e377c2', '#7f7f7f', '#bcbd22', '#17becf',
  '#aec7e8', '#ffbb78', '#98df8a', '#ff9896', '#c5b0d5',
];

export class PieChart extends BaseChart {
  private layer: PieLayer;
  private opts: Required<Pick<PieChartOptions, 'showLabels' | 'showPercentage' | 'groupThreshold' | 'labelThreshold'>>;
  private currentData: PieChartData | null = null;
  private sliceAngles: Array<[number, number]> = [];
  private tooltip: Tooltip;

  constructor(container: HTMLElement, options: PieChartOptions = {}) {
    super(container, { ...options, interactive: false });

    this.opts = {
      showLabels: options.showLabels ?? true,
      showPercentage: options.showPercentage ?? true,
      groupThreshold: options.groupThreshold ?? 2,
      labelThreshold: options.labelThreshold ?? 3,
    };

    this.engine.createShader('pie', { vertex: PIE_VERT, fragment: PIE_FRAG });
    this.layer = new PieLayer();
    this.engine.addLayer(this.layer);

    this.tooltip = new Tooltip(container);
    this.attachHoverHandler();
  }

  private attachHoverHandler(): void {
    const canvas = this.engine.gl.canvas as HTMLCanvasElement;
    const onMove = throttle((e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      this.handleHover(e.clientX - rect.left, e.clientY - rect.top);
    }, 32);
    canvas.addEventListener('mousemove', onMove as EventListener);
    canvas.addEventListener('mouseleave', () => this.tooltip.hide());
  }

  private handleHover(sx: number, sy: number): void {
    if (!this.currentData || this.sliceAngles.length === 0) return;

    const data = this.currentData;
    const area = this.plotArea;
    const cx = area.x + area.width / 2;
    const cy = area.y + area.height / 2;
    const radius = Math.min(area.width, area.height) / 2 * 0.85;
    const innerRadius = radius * (data.innerRadius ?? 0);
    const total = data.slices.reduce((s, d) => s + d.value, 0);

    const idx = hitTestPieSlice(sx, sy, cx, cy, radius, innerRadius, this.sliceAngles);

    if (idx < 0) { this.tooltip.hide(); return; }

    const slice = data.slices[idx];
    this.tooltip.show(sx, sy, {
      title: slice.label,
      rows: [
        { label: 'Value', value: slice.value.toLocaleString(), color: slice.color },
        { label: 'Ratio', value: `${((slice.value / total) * 100).toFixed(1)}%` },
      ],
    });
  }

  update(data: PieChartData): void {
    this.storeData(data);
    // Group small slices into "Others"
    const rawTotal = data.slices.reduce((s, d) => s + d.value, 0);
    const threshold = this.opts.groupThreshold / 100;
    const grouped: PieSlice[] = [];
    let othersValue = 0;

    // Sort by value descending so "Others" is last
    const sorted = [...data.slices].sort((a, b) => b.value - a.value);
    for (const slice of sorted) {
      if (rawTotal > 0 && slice.value / rawTotal < threshold) {
        othersValue += slice.value;
      } else {
        grouped.push(slice);
      }
    }
    if (othersValue > 0) {
      grouped.push({ label: 'Others', value: othersValue, color: '#6b7280' });
    }

    const processedData: PieChartData = { ...data, slices: grouped };
    this.currentData = processedData;

    // Build sliceAngles for hit testing
    const total = processedData.slices.reduce((s, d) => s + d.value, 0);
    this.sliceAngles = [];
    let angle = -Math.PI / 2;
    for (const slice of processedData.slices) {
      const sliceAngle = (slice.value / total) * Math.PI * 2;
      this.sliceAngles.push([angle, angle + sliceAngle]);
      angle += sliceAngle;
    }

    const area = this.plotArea;
    const cx = area.x + area.width / 2;
    const cy = area.y + area.height / 2;
    const radius = Math.min(area.width, area.height) / 2 * 0.85;
    const innerRadius = radius * (processedData.innerRadius ?? 0);

    if (total === 0) return;

    const SEGMENTS_PER_SLICE = 64; // arc resolution
    const vertices: number[] = [];

    const pushTriangle = (
      x1: number, y1: number,
      x2: number, y2: number,
      x3: number, y3: number,
      color: Vec4,
    ): void => {
      const c = [color.r, color.g, color.b, color.a];
      vertices.push(x1, y1, ...c, x2, y2, ...c, x3, y3, ...c);
    };

    let renderAngle = -Math.PI / 2; // start at top

    for (let i = 0; i < processedData.slices.length; i++) {
      const slice = processedData.slices[i];
      const sliceAngle = (slice.value / total) * Math.PI * 2;
      const color = hexToVec4(slice.color ?? DEFAULT_COLORS[i % DEFAULT_COLORS.length]);

      const segAngle = sliceAngle / SEGMENTS_PER_SLICE;

      for (let s = 0; s < SEGMENTS_PER_SLICE; s++) {
        const a0 = renderAngle + segAngle * s;
        const a1 = renderAngle + segAngle * (s + 1);

        const outerX0 = cx + Math.cos(a0) * radius;
        const outerY0 = cy + Math.sin(a0) * radius;
        const outerX1 = cx + Math.cos(a1) * radius;
        const outerY1 = cy + Math.sin(a1) * radius;

        if (innerRadius > 0) {
          // Donut: two triangles per segment
          const innerX0 = cx + Math.cos(a0) * innerRadius;
          const innerY0 = cy + Math.sin(a0) * innerRadius;
          const innerX1 = cx + Math.cos(a1) * innerRadius;
          const innerY1 = cy + Math.sin(a1) * innerRadius;

          pushTriangle(innerX0, innerY0, outerX0, outerY0, outerX1, outerY1, color);
          pushTriangle(innerX0, innerY0, outerX1, outerY1, innerX1, innerY1, color);
        } else {
          // Full pie: triangle fan from center
          pushTriangle(cx, cy, outerX0, outerY0, outerX1, outerY1, color);
        }
      }

      renderAngle += sliceAngle;
    }

    // Upload
    const vertexData = new Float32Array(vertices);
    this.engine.setBuffer('pie_vertices', { data: vertexData, usage: 'dynamic', size: 6 });
    this.layer.vertexCount = vertices.length / 6;

    // Labels
    const vw = this.engine.viewport.width / this.engine.viewport.pixelRatio;
    const vh = this.engine.viewport.height / this.engine.viewport.pixelRatio;
    this.overlay.resize(vw, vh);
    this.text.resize(vw, vh);

    if (this.opts.showLabels) {
      let labelAngle = -Math.PI / 2;
      const labelRadius = radius * 1.15;
      const labelThreshold = this.opts.labelThreshold / 100;

      for (let i = 0; i < processedData.slices.length; i++) {
        const slice = processedData.slices[i];
        const sliceAngle = (slice.value / total) * Math.PI * 2;
        const midAngle = labelAngle + sliceAngle / 2;
        const pct = slice.value / total;

        // Skip label for slices below labelThreshold
        if (pct >= labelThreshold) {
          const lx = cx + Math.cos(midAngle) * labelRadius;
          const ly = cy + Math.sin(midAngle) * labelRadius;

          let label = slice.label;
          if (this.opts.showPercentage) {
            label += ` (${(pct * 100).toFixed(1)}%)`;
          }

          const align: CanvasTextAlign = Math.cos(midAngle) > 0.1 ? 'left' : Math.cos(midAngle) < -0.1 ? 'right' : 'center';

          this.text.add(label, lx, ly, {
            color: { r: 0.9, g: 0.9, b: 0.9, a: 1 },
            fontSize: 11, align, baseline: 'middle',
          });
        }

        labelAngle += sliceAngle;
      }
    }

    if (processedData.title) {
      this.text.add(processedData.title, area.x + area.width / 2, 10, {
        color: { r: 1, g: 1, b: 1, a: 1 }, fontSize: 14, align: 'center', baseline: 'top',
      });
    }

    this.text.flush();
    this.engine.requestRender();
  }

  destroy(): void {
    this.tooltip.destroy();
    super.destroy();
  }
}
