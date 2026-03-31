import {
  type RenderEngine, type RenderLayer, type RenderState,
  type Vec4,
  ortho, hexToVec4,
  Tooltip, throttle,
} from '@seegak/core';
import { BaseChart, type BaseChartOptions } from '../base-chart.js';
import { hitTestGroup } from '../utils/chart-hit-test.js';

// ─── Shaders (same as boxplot — simple colored triangles) ───

const BAR_VERT = `#version 300 es
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

const BAR_FRAG = `#version 300 es
precision highp float;

in vec4 v_color;
out vec4 fragColor;

void main() {
  fragColor = v_color;
}
`;

// ─── Types ───

export interface BarGroup {
  label: string;
  value: number;
  color?: string;
}

export interface StackedBarGroup {
  label: string;
  segments: Array<{ value: number; color: string; label?: string }>;
}

export interface BarChartData {
  groups: BarGroup[] | StackedBarGroup[];
  title?: string;
  xLabel?: string;
  yLabel?: string;
  orientation?: 'vertical' | 'horizontal';
  stacked?: boolean;
}

export interface BarChartOptions extends BaseChartOptions {
  barWidth?: number;
  defaultColor?: string;
  gap?: number;
}

// ─── Render Layer ───

class BarLayer implements RenderLayer {
  id = 'bar';
  order = 10;
  vertexCount = 0;

  render(engine: RenderEngine, state: RenderState): void {
    if (this.vertexCount === 0) return;
    const gl = engine.gl;
    const shader = engine.getShader('bar');
    if (!shader) return;

    shader.use();
    const w = state.viewport.width / state.viewport.pixelRatio;
    const h = state.viewport.height / state.viewport.pixelRatio;
    shader.setUniform('u_projection', { type: 'mat4', value: ortho(0, w, h, 0, -1, 1) });

    const buf = engine.buffers.get('bar_vertices');
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
];

export class BarChart extends BaseChart {
  private layer: BarLayer;
  private opts: Required<Pick<BarChartOptions, 'barWidth' | 'defaultColor' | 'gap'>>;
  private currentData: BarChartData | null = null;
  private tooltip: Tooltip;

  constructor(container: HTMLElement, options: BarChartOptions = {}) {
    super(container, { ...options, interactive: false });

    this.opts = {
      barWidth: options.barWidth ?? 0.7,
      defaultColor: options.defaultColor ?? '#1f77b4',
      gap: options.gap ?? 0.1,
    };

    this.engine.createShader('bar', { vertex: BAR_VERT, fragment: BAR_FRAG });
    this.layer = new BarLayer();
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
    if (!this.currentData) return;

    const data = this.currentData;
    const isVertical = (data.orientation ?? 'vertical') === 'vertical';
    const area = this.plotArea;

    const idx = hitTestGroup(
      isVertical ? sx : sy,
      isVertical ? area.x : area.y,
      isVertical ? area.width : area.height,
      data.groups.length,
    );

    if (idx < 0) { this.tooltip.hide(); return; }

    const g = data.groups[idx];

    if (data.stacked && 'segments' in g) {
      const stacked = g as import('./bar.js').StackedBarGroup;
      const total = stacked.segments.reduce((s, seg) => s + seg.value, 0);
      this.tooltip.show(sx, sy, {
        title: stacked.label,
        rows: [
          ...stacked.segments.map(seg => ({
            label: seg.label ?? 'Segment',
            value: seg.value.toLocaleString(),
            color: seg.color,
          })),
          { label: 'Total', value: total.toLocaleString() },
        ],
      });
    } else {
      const simple = g as import('./bar.js').BarGroup;
      this.tooltip.show(sx, sy, {
        title: simple.label,
        rows: [{ label: 'Value', value: simple.value.toLocaleString() }],
      });
    }
  }

  update(data: BarChartData): void {
    this.storeData(data);
    this.currentData = data;
    const isVertical = (data.orientation ?? 'vertical') === 'vertical';
    const area = this.plotArea;
    const groups = data.groups;
    const n = groups.length;

    const vertices: number[] = [];

    const pushQuad = (x1: number, y1: number, x2: number, y2: number, color: Vec4): void => {
      const c = [color.r, color.g, color.b, color.a];
      vertices.push(x1, y1, ...c, x2, y1, ...c, x1, y2, ...c);
      vertices.push(x2, y1, ...c, x2, y2, ...c, x1, y2, ...c);
    };

    // Find max value
    let maxVal = 0;
    for (const g of groups) {
      if (data.stacked && 'segments' in g) {
        const sum = (g as StackedBarGroup).segments.reduce((s, seg) => s + seg.value, 0);
        if (sum > maxVal) maxVal = sum;
      } else {
        if ((g as BarGroup).value > maxVal) maxVal = (g as BarGroup).value;
      }
    }
    if (maxVal === 0) maxVal = 1;

    const groupSize = (isVertical ? area.width : area.height) / n;
    const barSize = groupSize * this.opts.barWidth;
    const gapSize = groupSize * (1 - this.opts.barWidth) / 2;

    for (let i = 0; i < n; i++) {
      const g = groups[i];
      const start = (isVertical ? area.x : area.y) + groupSize * i + gapSize;

      if (data.stacked && 'segments' in g) {
        const stacked = g as StackedBarGroup;
        let cumulative = 0;
        for (let s = 0; s < stacked.segments.length; s++) {
          const seg = stacked.segments[s];
          const t0 = cumulative / maxVal;
          cumulative += seg.value;
          const t1 = cumulative / maxVal;
          const color = hexToVec4(seg.color);

          if (isVertical) {
            const y0 = area.y + area.height * (1 - t0);
            const y1 = area.y + area.height * (1 - t1);
            pushQuad(start, y1, start + barSize, y0, color);
          } else {
            const x0 = area.x + area.width * t0;
            const x1 = area.x + area.width * t1;
            pushQuad(x0, start, x1, start + barSize, color);
          }
        }
      } else {
        const simple = g as BarGroup;
        const t = simple.value / maxVal;
        const color = hexToVec4(simple.color ?? DEFAULT_COLORS[i % DEFAULT_COLORS.length]);

        if (isVertical) {
          const barTop = area.y + area.height * (1 - t);
          const barBottom = area.y + area.height;
          pushQuad(start, barTop, start + barSize, barBottom, color);
        } else {
          const barRight = area.x + area.width * t;
          pushQuad(area.x, start, barRight, start + barSize, color);
        }
      }
    }

    // Upload
    const vertexData = new Float32Array(vertices);
    this.engine.setBuffer('bar_vertices', { data: vertexData, usage: 'dynamic', size: 6 });
    this.layer.vertexCount = vertices.length / 6;

    // Labels
    const vw = this.engine.viewport.width / this.engine.viewport.pixelRatio;
    const vh = this.engine.viewport.height / this.engine.viewport.pixelRatio;
    this.overlay.resize(vw, vh);
    this.text.resize(vw, vh);

    if (this.showAxes) {
      const labelColor = { r: 0.8, g: 0.8, b: 0.8, a: 1 };
      const axisColor = { r: 0.6, g: 0.7, b: 0.8, a: 1 };

      // Group labels — auto-rotate, truncate, or collapse to colored dots
      const FONT = 11;
      const SIN45 = Math.sin(Math.PI / 4);
      const slotW = isVertical ? groupSize : (isVertical ? area.width : area.height) / n;
      const maxLabelW = groups.reduce((m, g) => Math.max(m, this.text.measure('label' in g ? g.label : `${g}`, FONT)), 0);
      const needsRotation = isVertical && maxLabelW > slotW * 0.85;
      // When slot is too narrow even for rotated text, collapse to dot-only mode
      const dotOnlyMode = isVertical && slotW < 18;
      // Reserve space for xLabel so group labels don't cover it
      const xLabelReserve = (isVertical && data.xLabel) ? 20 : 0;
      const labelStartOffset = needsRotation ? 12 : 8;
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
        const center = (isVertical ? area.x : area.y) + groupSize * (i + 0.5);
        const rawLabel = 'label' in groups[i] ? groups[i].label : `${i}`;

        if (dotOnlyMode && isVertical) {
          // Show a colored dot (●) instead of text label — full name appears in tooltip on hover
          const g = groups[i];
          const colorHex = ('color' in g && g.color) ? g.color : DEFAULT_COLORS[i % DEFAULT_COLORS.length];
          const dotColor = hexToVec4(colorHex);
          this.text.add('●', center, area.y + area.height + 6, {
            color: dotColor, fontSize: 8, align: 'center', baseline: 'top',
          });
        } else if (isVertical) {
          this.text.add(fitLabel(rawLabel), center, area.y + area.height + labelStartOffset, {
            color: labelColor, fontSize: FONT,
            align: needsRotation ? 'right' : 'center', baseline: 'top',
            rotation: needsRotation ? -Math.PI / 4 : 0,
          });
        } else {
          this.text.add(rawLabel, area.x - 8, center, {
            color: labelColor, fontSize: FONT, align: 'right', baseline: 'middle',
          });
        }
      }

      if (data.title) {
        this.text.add(data.title, area.x + area.width / 2, 10, {
          color: { r: 1, g: 1, b: 1, a: 1 }, fontSize: 14, align: 'center', baseline: 'top',
        });
      }

      if (data.xLabel) {
        // Position xLabel below where group labels end (never overlaps)
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

    this.drawGrid();
    this.text.flush();
    this.engine.requestRender();
  }

  destroy(): void {
    this.tooltip.destroy();
    super.destroy();
  }
}
