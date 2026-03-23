import {
  type RenderEngine, type RenderLayer, type RenderState, type ShaderProgram,
  cameraMatrix, hexToVec4,
  type SelectionEvent,
} from '@seegak/core';
import { BaseChart, type BaseChartOptions } from '@seegak/bio-charts';
import { GateManager, type Gate } from './gate-manager.js';

// ─── Shaders ───

const SCATTER_VERT = `#version 300 es
precision highp float;

layout(location = 0) in float a_x;
layout(location = 1) in float a_y;

uniform mat4 u_projection;
uniform float u_pointSize;

void main() {
  gl_Position = u_projection * vec4(a_x, a_y, 0.0, 1.0);
  gl_PointSize = u_pointSize;
}
`;

const SCATTER_FRAG = `#version 300 es
precision highp float;

uniform vec4 u_color;
uniform float u_opacity;

out vec4 fragColor;

void main() {
  vec2 cxy = 2.0 * gl_PointCoord - 1.0;
  float r = dot(cxy, cxy);
  if (r > 1.0) discard;
  float alpha = 1.0 - smoothstep(0.8, 1.0, r);
  fragColor = vec4(u_color.rgb, u_color.a * alpha * u_opacity);
}
`;

// Gate overlay: filled triangle fan + border line loop
const GATE_VERT = `#version 300 es
precision highp float;

layout(location = 0) in vec2 a_position;

uniform mat4 u_projection;

void main() {
  gl_Position = u_projection * vec4(a_position, 0.0, 1.0);
}
`;

const GATE_FRAG = `#version 300 es
precision highp float;

uniform vec4 u_color;
uniform float u_alpha;

out vec4 fragColor;

void main() {
  fragColor = vec4(u_color.rgb, u_color.a * u_alpha);
}
`;

// ─── Types ───

export interface GatingPlotData {
  x: Float32Array;
  y: Float32Array;
  xLabel: string;
  yLabel: string;
  clusterLabels?: string[];
}

export interface GatingPlotOptions extends BaseChartOptions {
  onGateCreated?: (gate: Gate) => void;
  onGateSelected?: (gateId: string, memberIndices: Uint32Array) => void;
}

// ─── Gate Render Layer ───

class GateLayer implements RenderLayer {
  id = 'gating-gates';
  order = 20;

  private gates: Gate[] = [];

  render(engine: RenderEngine, state: RenderState): void {
    if (this.gates.length === 0) return;

    const gl = engine.gl;
    const shader = engine.getShader('gating-gate');
    if (!shader) return;

    shader.use();
    shader.setUniform('u_projection', {
      type: 'mat4',
      value: cameraMatrix(state.viewport, state.camera),
    });

    for (const gate of this.gates) {
      this._renderGate(gl, engine, shader, gate);
    }
  }

  private _renderGate(
    gl: WebGL2RenderingContext,
    _engine: RenderEngine,
    shader: ShaderProgram,
    gate: Gate,
  ): void {
    const verts = gate.vertices;
    const nVerts = verts.length / 2;
    if (nVerts < 3) return;

    const color = hexToVec4(gate.color);
    shader.setUniform('u_color', {
      type: 'vec4',
      value: [color.r, color.g, color.b, color.a],
    });

    // ── Filled fan (10% opacity) ──
    // Fan triangulation: vertex 0 is the center/anchor, each subsequent pair forms a triangle
    const fanCount = (nVerts - 2) * 3;
    const fanData = new Float32Array(fanCount * 2);
    let fi = 0;
    for (let i = 1; i < nVerts - 1; i++) {
      // triangle: verts[0], verts[i], verts[i+1]
      fanData[fi++] = verts[0]!;
      fanData[fi++] = verts[1]!;
      fanData[fi++] = verts[i * 2]!;
      fanData[fi++] = verts[i * 2 + 1]!;
      fanData[fi++] = verts[(i + 1) * 2]!;
      fanData[fi++] = verts[(i + 1) * 2 + 1]!;
    }

    const fillBuf = gl.createBuffer();
    if (!fillBuf) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, fillBuf);
    gl.bufferData(gl.ARRAY_BUFFER, fanData, gl.STREAM_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    shader.setUniform('u_alpha', { type: 'float', value: 0.10 });
    gl.drawArrays(gl.TRIANGLES, 0, fanCount);

    // ── Border line loop ──
    const borderData = new Float32Array(verts);
    const borderBuf = gl.createBuffer();
    if (borderBuf) {
      gl.bindBuffer(gl.ARRAY_BUFFER, borderBuf);
      gl.bufferData(gl.ARRAY_BUFFER, borderData, gl.STREAM_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

      shader.setUniform('u_alpha', { type: 'float', value: 1.0 });
      gl.drawArrays(gl.LINE_LOOP, 0, nVerts);

      gl.bindBuffer(gl.ARRAY_BUFFER, null);
      gl.deleteBuffer(borderBuf);
    }

    gl.disableVertexAttribArray(0);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    gl.deleteBuffer(fillBuf);
  }

  setGates(gates: Gate[]): void {
    this.gates = gates;
  }
}

// ─── Scatter Layer ───

class ScatterLayer implements RenderLayer {
  id = 'gating-scatter';
  order = 10;
  private pointCount = 0;

  render(engine: RenderEngine, state: RenderState): void {
    if (this.pointCount === 0) return;

    const gl = engine.gl;
    const shader = engine.getShader('gating-scatter');
    if (!shader) return;

    shader.use();
    shader.setUniform('u_projection', {
      type: 'mat4',
      value: cameraMatrix(state.viewport, state.camera),
    });

    const xBuf = engine.buffers.get('gating_x');
    if (!xBuf) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, xBuf);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 1, gl.FLOAT, false, 0, 0);

    const yBuf = engine.buffers.get('gating_y');
    if (!yBuf) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, yBuf);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 0, 0);

    gl.drawArrays(gl.POINTS, 0, this.pointCount);

    gl.disableVertexAttribArray(0);
    gl.disableVertexAttribArray(1);
  }

  setPointCount(n: number): void { this.pointCount = n; }
}

// ─── Helpers ───

function generateGateColor(index: number): string {
  const colors = [
    '#ef4444', '#f97316', '#eab308', '#22c55e',
    '#06b6d4', '#3b82f6', '#a855f7', '#ec4899',
  ];
  return colors[index % colors.length]!;
}

// ─── GatingPlot ───

export class GatingPlot extends BaseChart {
  private scatterLayer: ScatterLayer;
  private gateLayer: GateLayer;
  readonly gateManager: GateManager;
  private opts: GatingPlotOptions;
  private currentData: GatingPlotData | null = null;
  private _gateCount = 0;

  constructor(container: HTMLElement, options: GatingPlotOptions = {}) {
    super(container, options);
    this.opts = options;

    // Shaders
    this.engine.createShader('gating-scatter', { vertex: SCATTER_VERT, fragment: SCATTER_FRAG });
    this.engine.createShader('gating-gate', { vertex: GATE_VERT, fragment: GATE_FRAG });

    // Set default point appearance
    const scatterShader = this.engine.getShader('gating-scatter')!;
    scatterShader.use();
    scatterShader.setUniform('u_pointSize', { type: 'float', value: 4 });
    scatterShader.setUniform('u_color', { type: 'vec4', value: [0.4, 0.6, 0.9, 1.0] });
    scatterShader.setUniform('u_opacity', { type: 'float', value: 0.7 });

    // Layers
    this.scatterLayer = new ScatterLayer();
    this.gateLayer = new GateLayer();
    this.engine.addLayer(this.scatterLayer);
    this.engine.addLayer(this.gateLayer);

    // Gate manager
    this.gateManager = new GateManager();
    this.gateManager.onChanged(() => {
      this.gateLayer.setGates(this.gateManager.getAllGates());
      this.engine.requestRender();
    });

    // Wire up lasso/box selection → gate creation
    this.overlay.onSelect((e: SelectionEvent) => {
      if (this.currentData) {
        this._handleSelection(e);
      }
    });
  }

  update(data: GatingPlotData): void {
    this.currentData = data;
    const n = data.x.length;

    this.engine.setBuffer('gating_x', { data: data.x, usage: 'dynamic', size: 1 });
    this.engine.setBuffer('gating_y', { data: data.y, usage: 'dynamic', size: 1 });
    this.scatterLayer.setPointCount(n);

    // autoFit
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < n; i++) {
      const x = data.x[i]!;
      const y = data.y[i]!;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const rangeX = maxX - minX || 1;
    const rangeY = maxY - minY || 1;
    const aspect = this.engine.viewport.width / this.engine.viewport.height;
    const zoom = Math.min(2 * aspect / (rangeX * 1.1), 2 / (rangeY * 1.1));
    this.engine.camera = { center: { x: cx, y: cy }, zoom };

    const vw = this.engine.viewport.width / this.engine.viewport.pixelRatio;
    const vh = this.engine.viewport.height / this.engine.viewport.pixelRatio;
    this.overlay.resize(vw, vh);

    this.engine.requestRender();
  }

  private _handleSelection(e: SelectionEvent): void {
    if (!this.currentData) return;

    const data = this.currentData;
    const color = generateGateColor(this._gateCount);
    let worldVertices: Float32Array;
    let gateType: Gate['type'];

    if (e.type === 'box') {
      // Convert box screen coords to world-space polygon (4 corners)
      const corners = [
        { x: e.x, y: e.y },
        { x: e.x + e.width, y: e.y },
        { x: e.x + e.width, y: e.y + e.height },
        { x: e.x, y: e.y + e.height },
      ];
      worldVertices = new Float32Array(8);
      for (let i = 0; i < 4; i++) {
        const w = this._cssToWorld(corners[i]!.x, corners[i]!.y);
        worldVertices[i * 2] = w.x;
        worldVertices[i * 2 + 1] = w.y;
      }
      gateType = 'rectangle';
    } else {
      // Lasso: convert CSS screen poly to world space
      const pts = e.points;
      worldVertices = new Float32Array(pts.length * 2);
      for (let i = 0; i < pts.length; i++) {
        const w = this._cssToWorld(pts[i]!.x, pts[i]!.y);
        worldVertices[i * 2] = w.x;
        worldVertices[i * 2 + 1] = w.y;
      }
      gateType = 'polygon';
    }

    const gateName = `Gate ${this._gateCount + 1}`;
    this._gateCount++;

    const gateId = this.gateManager.addGate({
      id: `gate-${Date.now()}`,
      name: gateName,
      type: gateType,
      vertices: worldVertices,
      xAxis: data.xLabel,
      yAxis: data.yLabel,
      color,
      parentGateId: null,
    });

    // Compute membership and fire callbacks
    void this.gateManager.computeMembers(gateId, data.x, data.y).then((memberIndices) => {
      const gate = this.gateManager.getGate(gateId);
      if (gate) {
        this.opts.onGateCreated?.(gate);
        this.opts.onGateSelected?.(gateId, memberIndices);
      }
    });

  }

  private _cssToWorld(cssX: number, cssY: number): { x: number; y: number } {
    const pr = this.engine.viewport.pixelRatio;
    const vp = this.engine.viewport;
    const cam = this.engine.camera;
    // CSS px → device px, then world
    const devX = cssX * pr;
    const devY = cssY * pr;
    const ndcX = (devX / vp.width) * 2 - 1;
    const ndcY = 1 - (devY / vp.height) * 2;
    const worldX = ndcX / cam.zoom + cam.center.x;
    const worldY = ndcY / cam.zoom + cam.center.y;
    return { x: worldX, y: worldY };
  }
}
