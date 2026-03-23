/**
 * Axis renderer — draws axes, tick marks, grid lines, and labels
 * using the TextRenderer (for labels) and WebGL (for lines).
 */

import type { RenderEngine, RenderLayer } from './render-engine.js';
import type { RenderState, Vec4 } from '../types.js';
import { ortho } from '../utils/math.js';
import type { TextRenderer } from './text-renderer.js';

export interface AxisConfig {
  /** Show this axis */
  visible?: boolean;
  /** Axis title */
  title?: string;
  /** Number of tick marks */
  tickCount?: number;
  /** Custom tick values (overrides tickCount) */
  tickValues?: number[];
  /** Format tick labels */
  tickFormat?: (value: number) => string;
  /** Show grid lines */
  showGrid?: boolean;
  /** Grid line color */
  gridColor?: Vec4;
  /** Axis line color */
  axisColor?: Vec4;
  /** Label color */
  labelColor?: Vec4;
  /** Label font size */
  fontSize?: number;
  /** Title font size */
  titleFontSize?: number;
}

export interface AxesConfig {
  x?: AxisConfig;
  y?: AxisConfig;
  /** Plot area margins in pixels */
  margin?: { top: number; right: number; bottom: number; left: number };
}

// ─── Shaders ───

const LINE_VERT = `#version 300 es
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

const LINE_FRAG = `#version 300 es
precision highp float;

in vec4 v_color;
out vec4 fragColor;

void main() {
  fragColor = v_color;
}
`;

// ─── Tick Generation ───

/** Generate nice round tick values for a given range */
export function generateTicks(min: number, max: number, count: number): number[] {
  if (min === max) return [min];

  const range = max - min;
  const roughStep = range / (count - 1);

  // Find nice step size
  const magnitude = Math.pow(10, Math.floor(Math.log10(roughStep)));
  const residual = roughStep / magnitude;

  let niceStep: number;
  if (residual <= 1.5) niceStep = 1;
  else if (residual <= 3) niceStep = 2;
  else if (residual <= 7) niceStep = 5;
  else niceStep = 10;
  niceStep *= magnitude;

  const niceMin = Math.floor(min / niceStep) * niceStep;
  const niceMax = Math.ceil(max / niceStep) * niceStep;

  const ticks: number[] = [];
  for (let v = niceMin; v <= niceMax + niceStep * 0.5; v += niceStep) {
    if (v >= min - niceStep * 0.01 && v <= max + niceStep * 0.01) {
      ticks.push(Math.round(v * 1e10) / 1e10); // avoid float artifacts
    }
  }

  return ticks;
}

// ─── Axis Render Layer ───

export class AxisLayer implements RenderLayer {
  id = 'axes';
  order = 5; // Draw before chart data

  vertexCount = 0;

  render(engine: RenderEngine, state: RenderState): void {
    if (this.vertexCount === 0) return;

    const gl = engine.gl;
    const shader = engine.getShader('axes');
    if (!shader) return;

    shader.use();
    const w = state.viewport.width / state.viewport.pixelRatio;
    const h = state.viewport.height / state.viewport.pixelRatio;
    shader.setUniform('u_projection', { type: 'mat4', value: ortho(0, w, h, 0, -1, 1) });

    const buf = engine.buffers.get('axes_vertices');
    if (!buf) return;

    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 24, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 24, 8);

    gl.drawArrays(gl.LINES, 0, this.vertexCount);

    gl.disableVertexAttribArray(0);
    gl.disableVertexAttribArray(1);
  }
}

// ─── Axis Builder ───

export class AxisBuilder {
  private layer: AxisLayer;
  private config: AxesConfig;

  constructor(
    private engine: RenderEngine,
    private text: TextRenderer,
    config?: AxesConfig,
  ) {
    this.config = {
      margin: { top: 40, right: 20, bottom: 60, left: 80 },
      ...config,
    };

    if (!engine.getShader('axes')) {
      engine.createShader('axes', { vertex: LINE_VERT, fragment: LINE_FRAG });
    }

    this.layer = new AxisLayer();
    engine.addLayer(this.layer);
  }

  /** Build axes for the given data range */
  build(
    xRange: [number, number],
    yRange: [number, number],
    canvasWidth: number,
    canvasHeight: number,
  ): void {
    const margin = this.config.margin!;
    const xConf = { visible: true, tickCount: 8, showGrid: true, fontSize: 11, titleFontSize: 13, ...this.config.x };
    const yConf = { visible: true, tickCount: 6, showGrid: true, fontSize: 11, titleFontSize: 13, ...this.config.y };

    const plotX = margin.left;
    const plotY = margin.top;
    const plotW = canvasWidth - margin.left - margin.right;
    const plotH = canvasHeight - margin.top - margin.bottom;

    const defaultAxisColor: Vec4 = { r: 0.5, g: 0.5, b: 0.5, a: 1 };
    const defaultGridColor: Vec4 = { r: 0.2, g: 0.2, b: 0.2, a: 0.5 };
    const defaultLabelColor: Vec4 = { r: 0.8, g: 0.8, b: 0.8, a: 1 };

    const vertices: number[] = [];

    const pushLine = (x1: number, y1: number, x2: number, y2: number, color: Vec4): void => {
      vertices.push(x1, y1, color.r, color.g, color.b, color.a);
      vertices.push(x2, y2, color.r, color.g, color.b, color.a);
    };

    const defaultFormat = (v: number): string => {
      if (Math.abs(v) >= 1e6) return v.toExponential(1);
      if (Math.abs(v) >= 1000) return v.toLocaleString();
      if (Number.isInteger(v)) return String(v);
      return v.toFixed(2);
    };

    // ─── X Axis ───
    if (xConf.visible) {
      const axisColor = xConf.axisColor ?? defaultAxisColor;
      const gridColor = xConf.gridColor ?? defaultGridColor;
      const labelColor = xConf.labelColor ?? defaultLabelColor;
      const format = xConf.tickFormat ?? defaultFormat;

      // Axis line
      pushLine(plotX, plotY + plotH, plotX + plotW, plotY + plotH, axisColor);

      const ticks = xConf.tickValues ?? generateTicks(xRange[0], xRange[1], xConf.tickCount!);
      for (const val of ticks) {
        const t = (val - xRange[0]) / (xRange[1] - xRange[0]);
        const px = plotX + t * plotW;

        // Tick mark
        pushLine(px, plotY + plotH, px, plotY + plotH + 5, axisColor);

        // Grid line
        if (xConf.showGrid) {
          pushLine(px, plotY, px, plotY + plotH, gridColor);
        }

        // Label
        this.text.add(format(val), px, plotY + plotH + 8, {
          color: labelColor, fontSize: xConf.fontSize!, align: 'center', baseline: 'top',
        });
      }

      // Title
      if (xConf.title) {
        this.text.add(xConf.title, plotX + plotW / 2, canvasHeight - 10, {
          color: labelColor, fontSize: xConf.titleFontSize!, align: 'center', baseline: 'bottom',
        });
      }
    }

    // ─── Y Axis ───
    if (yConf.visible) {
      const axisColor = yConf.axisColor ?? defaultAxisColor;
      const gridColor = yConf.gridColor ?? defaultGridColor;
      const labelColor = yConf.labelColor ?? defaultLabelColor;
      const format = yConf.tickFormat ?? defaultFormat;

      // Axis line
      pushLine(plotX, plotY, plotX, plotY + plotH, axisColor);

      const ticks = yConf.tickValues ?? generateTicks(yRange[0], yRange[1], yConf.tickCount!);
      for (const val of ticks) {
        const t = (val - yRange[0]) / (yRange[1] - yRange[0]);
        const py = plotY + plotH - t * plotH; // flip Y

        // Tick mark
        pushLine(plotX - 5, py, plotX, py, axisColor);

        // Grid line
        if (yConf.showGrid) {
          pushLine(plotX, py, plotX + plotW, py, gridColor);
        }

        // Label
        this.text.add(format(val), plotX - 8, py, {
          color: labelColor, fontSize: yConf.fontSize!, align: 'right', baseline: 'middle',
        });
      }

      // Title (rotated)
      if (yConf.title) {
        this.text.add(yConf.title, 14, plotY + plotH / 2, {
          color: labelColor, fontSize: yConf.titleFontSize!, align: 'center', baseline: 'middle',
          rotation: -Math.PI / 2,
        });
      }
    }

    // Upload line vertices
    const vertexData = new Float32Array(vertices);
    this.engine.setBuffer('axes_vertices', { data: vertexData, usage: 'dynamic', size: 6 });
    this.layer.vertexCount = vertices.length / 6;
  }

  destroy(): void {
    this.engine.removeLayer('axes');
  }
}
