import {
  type RenderEngine, type RenderLayer, type RenderState,
  type ColorScale,
  cameraMatrix, colorScaleToTexture, screenToWorld,
  Tooltip, throttle,
  SpatialIndex,
  VIRIDIS,
} from '@seegak/core';
import { BaseChart, type BaseChartOptions } from '../base-chart.js';

// ─── Shaders ───

const FEATURE_VERT = `#version 300 es
precision highp float;

layout(location = 0) in vec2 a_position;
layout(location = 1) in float a_expression;

uniform mat4 u_projection;
uniform float u_pointSize;
uniform float u_minExpr;
uniform float u_maxExpr;

out float v_normalized;

void main() {
  gl_Position = u_projection * vec4(a_position, 0.0, 1.0);
  gl_PointSize = u_pointSize;

  // Normalize expression value to [0, 1]
  float range = u_maxExpr - u_minExpr;
  v_normalized = range > 0.0 ? (a_expression - u_minExpr) / range : 0.0;
}
`;

const FEATURE_FRAG = `#version 300 es
precision highp float;

in float v_normalized;

uniform sampler2D u_colorScale;
uniform float u_opacity;

out vec4 fragColor;

void main() {
  vec2 cxy = 2.0 * gl_PointCoord - 1.0;
  float r = dot(cxy, cxy);
  if (r > 1.0) discard;

  float alpha = 1.0 - smoothstep(0.8, 1.0, r);
  vec4 color = texture(u_colorScale, vec2(v_normalized, 0.5));

  fragColor = vec4(color.rgb, color.a * alpha * u_opacity);
}
`;

// ─── Types ───

export interface FeaturePlotData {
  /** UMAP/tSNE x coordinates */
  x: Float32Array;
  /** UMAP/tSNE y coordinates */
  y: Float32Array;
  /** Gene expression values (raw — will be normalized internally) */
  expression: Float32Array;
  /** Gene name for title display */
  geneName?: string;
}

export interface FeaturePlotOptions extends BaseChartOptions {
  pointSize?: number;
  opacity?: number;
  colorScale?: ColorScale;
  autoFit?: boolean;
}

// ─── Render Layer ───

class FeatureLayer implements RenderLayer {
  id = 'feature';
  order = 10;
  pointCount = 0;
  basePointSize = 5;

  render(engine: RenderEngine, state: RenderState): void {
    if (this.pointCount === 0) return;

    const gl = engine.gl;
    const shader = engine.getShader('feature');
    if (!shader) return;

    shader.use();
    shader.setUniform('u_projection', {
      type: 'mat4',
      value: cameraMatrix(state.viewport, state.camera),
    });

    // Scale point size with zoom so points don't vanish when zoomed in
    const zoomScale = Math.max(1.0, Math.sqrt(state.camera.zoom));
    const scaledSize = this.basePointSize * zoomScale;
    shader.setUniform('u_pointSize', { type: 'float', value: scaledSize });

    const posBuf = engine.buffers.get('feature_positions');
    if (!posBuf) return;

    gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    const exprBuf = engine.buffers.get('feature_expression');
    if (exprBuf) {
      gl.bindBuffer(gl.ARRAY_BUFFER, exprBuf);
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 0, 0);
    }

    const texUnit = engine.textures.bind('feature_colorscale');
    if (texUnit >= 0) {
      shader.setUniform('u_colorScale', { type: 'sampler2D', value: texUnit });
    }

    gl.drawArrays(gl.POINTS, 0, this.pointCount);

    gl.disableVertexAttribArray(0);
    gl.disableVertexAttribArray(1);
  }
}

// ─── Chart ───

export class FeaturePlotChart extends BaseChart {
  private layer: FeatureLayer;
  private opts: Required<Pick<FeaturePlotOptions, 'pointSize' | 'opacity' | 'colorScale' | 'autoFit'>>;
  private currentData: FeaturePlotData | null = null;
  private spatialIndex: SpatialIndex | null = null;
  private tooltip: Tooltip;
  private lastHoveredIdx = -1;
  private exprMin = 0;
  private exprMax = 1;

  constructor(container: HTMLElement, options: FeaturePlotOptions = {}) {
    super(container, options);

    this.opts = {
      pointSize: options.pointSize ?? 5,
      opacity: options.opacity ?? 0.9,
      colorScale: options.colorScale ?? VIRIDIS,
      autoFit: options.autoFit ?? true,
    };

    this.engine.createShader('feature', { vertex: FEATURE_VERT, fragment: FEATURE_FRAG });

    const lutData = colorScaleToTexture(this.opts.colorScale);
    this.engine.textures.createLUT('feature_colorscale', lutData);

    const shader = this.engine.getShader('feature')!;
    shader.use();
    shader.setUniform('u_opacity', { type: 'float', value: this.opts.opacity });

    this.layer = new FeatureLayer();
    this.layer.basePointSize = this.opts.pointSize;
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
    canvas.addEventListener('mouseleave', () => {
      this.tooltip.hide();
      this.lastHoveredIdx = -1;
    });
  }

  private handleHover(sx: number, sy: number): void {
    if (!this.currentData || !this.spatialIndex) return;

    const pr = this.engine.viewport.pixelRatio;
    const world = screenToWorld(
      { x: sx * pr, y: sy * pr },
      this.engine.viewport,
      this.engine.camera,
    );
    const radius = (this.opts.pointSize * pr) / this.engine.viewport.width
      * 2 / this.engine.camera.zoom * 2;

    const idx = this.spatialIndex.nearest(world.x, world.y, radius);

    if (idx === this.lastHoveredIdx) {
      this.tooltip.move(sx, sy);
      return;
    }
    this.lastHoveredIdx = idx;

    if (idx < 0) { this.tooltip.hide(); return; }

    const data = this.currentData;
    const rawExpr = data.expression[idx];
    const normExpr = (rawExpr - this.exprMin) / (this.exprMax - this.exprMin || 1);

    this.tooltip.show(sx, sy, {
      title: data.geneName ? `${data.geneName}` : 'Gene Expression',
      rows: [
        { label: 'UMAP 1',       value: data.x[idx].toFixed(4) },
        { label: 'UMAP 2',       value: data.y[idx].toFixed(4) },
        { label: 'Expression',   value: rawExpr.toFixed(4) },
        { label: 'Normalized',   value: `${(normExpr * 100).toFixed(1)}%` },
      ],
    });
  }

  update(data: FeaturePlotData): void {
    this.storeData(data);
    this.currentData = data;
    const n = data.x.length;

    // Positions
    const positions = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      positions[i * 2] = data.x[i];
      positions[i * 2 + 1] = data.y[i];
    }
    this.engine.setBuffer('feature_positions', { data: positions, usage: 'dynamic', size: 2 });

    // Expression values
    this.engine.setBuffer('feature_expression', { data: data.expression, usage: 'dynamic', size: 1 });

    // Compute expression range
    let minExpr = Infinity, maxExpr = -Infinity;
    for (let i = 0; i < data.expression.length; i++) {
      if (data.expression[i] < minExpr) minExpr = data.expression[i];
      if (data.expression[i] > maxExpr) maxExpr = data.expression[i];
    }
    this.exprMin = minExpr;
    this.exprMax = maxExpr;

    // Rebuild spatial index for fast hover
    this.spatialIndex = new SpatialIndex(data.x, data.y);

    const shader = this.engine.getShader('feature')!;
    shader.use();
    shader.setUniform('u_minExpr', { type: 'float', value: minExpr });
    shader.setUniform('u_maxExpr', { type: 'float', value: maxExpr });

    this.layer.pointCount = n;

    // Auto-fit
    if (this.opts.autoFit) {
      let minX = Infinity, maxX = -Infinity;
      let minY = Infinity, maxY = -Infinity;
      for (let i = 0; i < n; i++) {
        if (data.x[i] < minX) minX = data.x[i];
        if (data.x[i] > maxX) maxX = data.x[i];
        if (data.y[i] < minY) minY = data.y[i];
        if (data.y[i] > maxY) maxY = data.y[i];
      }
      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;
      const rangeX = maxX - minX || 1;
      const rangeY = maxY - minY || 1;
      const aspect = this.engine.viewport.width / this.engine.viewport.height;
      const zoom = Math.min(2 * aspect / (rangeX * 1.1), 2 / (rangeY * 1.1));
      this.engine.camera = { center: { x: cx, y: cy }, zoom };
    }

    // Draw colorbar and title with text renderer
    const vw = this.engine.viewport.width / this.engine.viewport.pixelRatio;
    const vh = this.engine.viewport.height / this.engine.viewport.pixelRatio;
    this.overlay.resize(vw, vh);
    this.text.resize(vw, vh);

    const area = this.plotArea;
    const white = { r: 1, g: 1, b: 1, a: 1 };

    if (data.geneName) {
      this.text.add(data.geneName, area.x + area.width / 2, 10, {
        color: white, fontSize: 14, align: 'center', baseline: 'top',
      });
    }

    // Colorbar labels
    const cbX = area.x + area.width + 10;
    this.text.add(maxExpr.toFixed(2), cbX, area.y, {
      color: white, fontSize: 10, align: 'left', baseline: 'top',
    });
    this.text.add(minExpr.toFixed(2), cbX, area.y + area.height, {
      color: white, fontSize: 10, align: 'left', baseline: 'bottom',
    });

    this.drawGrid();
    this.text.flush();
    this.engine.requestRender();
  }

  setColorScale(scale: ColorScale): void {
    this.opts.colorScale = scale;
    const lutData = colorScaleToTexture(scale);
    this.engine.textures.createLUT('feature_colorscale', lutData);
    this.engine.requestRender();
  }

  destroy(): void {
    this.tooltip.destroy();
    super.destroy();
  }
}
