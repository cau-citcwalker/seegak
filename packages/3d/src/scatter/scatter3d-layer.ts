import type { RenderLayer, RenderEngine, RenderState } from '@seegak/core';
import { ShaderProgram, colorScaleToTexture, VIRIDIS } from '@seegak/core';
import type { Scatter3DData, Scatter3DOptions } from '../types.js';
import type { Mat4 } from '../math/mat4.js';
import { mat4Multiply } from '../math/mat4.js';

// ─── Viridis approximation (fast, no texture needed) ────────────────────────

function viridisR(t: number): number {
  return Math.max(0, Math.min(1, 0.267004 + t * (0.003215 + t * (-0.284565 + t * (1.971511 + t * (-1.228819))))));
}
function viridisG(t: number): number {
  return Math.max(0, Math.min(1, 0.004874 + t * (1.015861 + t * (0.291879 + t * (-2.074591 + t * 1.564945)))));
}
function viridisB(t: number): number {
  return Math.max(0, Math.min(1, 0.329415 + t * (1.421218 + t * (-4.349384 + t * (6.805082 + t * (-3.659499))))));
}

// ─── Shaders ─────────────────────────────────────────────────────────────────

const SCATTER3D_VERT = /* glsl */ `#version 300 es
precision highp float;

layout(location = 0) in vec3 a_position;
layout(location = 1) in vec4 a_color;
layout(location = 2) in float a_visible;

uniform mat4 u_mvp;
uniform float u_pointSize;

out vec4 v_color;

void main() {
  // GPU-side visibility cull: skip rasterization entirely
  if (a_visible < 0.5) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0); // outside clip
    gl_PointSize = 0.0;
    v_color = vec4(0.0);
    return;
  }
  gl_Position = u_mvp * vec4(a_position, 1.0);
  float depth = gl_Position.w;
  gl_PointSize = clamp(u_pointSize * (2.0 / max(depth, 0.1)), 1.0, 64.0);
  v_color = a_color;
}
`;

const SCATTER3D_FRAG = /* glsl */ `#version 300 es
precision mediump float;

in vec4 v_color;

uniform float u_opacity;

out vec4 fragColor;

void main() {
  // Circular point with soft edge
  vec2 cxy = 2.0 * gl_PointCoord - 1.0;
  float r = dot(cxy, cxy);
  if (r > 1.0) discard;
  float alpha = 1.0 - smoothstep(0.7, 1.0, r);
  fragColor = vec4(v_color.rgb, v_color.a * alpha * u_opacity);
}
`;

// ─── Color helpers ───────────────────────────────────────────────────────────

/** 20 categorical colors (same as @seegak/core cluster palette) */
const CLUSTER_PALETTE = [
  '#e41a1c', '#377eb8', '#4daf4a', '#984ea3', '#ff7f00',
  '#a65628', '#f781bf', '#66c2a5', '#fc8d62', '#8da0cb',
  '#e78ac3', '#a6d854', '#ffd92f', '#e5c494', '#b3b3b3',
  '#1b9e77', '#d95f02', '#7570b3', '#e7298a', '#999999',
];

function hexToRGBA(hex: string): [number, number, number, number] {
  if (/^#[0-9a-f]{6}$/i.test(hex)) {
    return [
      parseInt(hex.slice(1, 3), 16) / 255,
      parseInt(hex.slice(3, 5), 16) / 255,
      parseInt(hex.slice(5, 7), 16) / 255,
      1,
    ];
  }
  if (/^#[0-9a-f]{3}$/i.test(hex)) {
    return [
      parseInt(hex[1]! + hex[1]!, 16) / 255,
      parseInt(hex[2]! + hex[2]!, 16) / 255,
      parseInt(hex[3]! + hex[3]!, 16) / 255,
      1,
    ];
  }
  return [0.8, 0.8, 0.8, 1];
}

// ─── Scatter3DLayer ──────────────────────────────────────────────────────────

export class Scatter3DLayer implements RenderLayer {
  readonly id = 'scatter3d';
  readonly order = 10;

  // Set by Scatter3DView
  viewMatrix: Mat4 | null = null;
  projMatrix: Mat4 | null = null;

  pointSize = 4;
  opacity = 0.85;
  pointCount = 0;

  private initialized = false;
  private gl: WebGL2RenderingContext | null = null;
  private shader: ShaderProgram | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private posBuffer: WebGLBuffer | null = null;
  private colorBuffer: WebGLBuffer | null = null;
  private visBuffer: WebGLBuffer | null = null;
  private labels: string[] | null = null;    // retained for cheap visibility updates
  private visBytes: Uint8Array | null = null; // 1 = visible, 0 = hidden

  // ─── RenderLayer ───────────────────────────────────────────────────────────

  render(engine: RenderEngine, _state: RenderState): void {
    const gl = engine.gl;

    if (!this.initialized) {
      this.initialized = true;
      this.gl = gl;
      this.shader = engine.createShader('scatter3d', {
        vertex: SCATTER3D_VERT,
        fragment: SCATTER3D_FRAG,
      });
    }

    if (!this.shader || !this.vao || !this.viewMatrix || !this.projMatrix || this.pointCount === 0) return;

    const mvp = mat4Multiply(this.projMatrix, this.viewMatrix);

    this.shader.use();
    const prog = this.shader.program;
    const loc = (n: string) => gl.getUniformLocation(prog, n);

    gl.uniformMatrix4fv(loc('u_mvp'), false, mvp);
    gl.uniform1f(loc('u_pointSize'), this.pointSize);
    gl.uniform1f(loc('u_opacity'), this.opacity);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.enable(gl.DEPTH_TEST);

    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.POINTS, 0, this.pointCount);
    gl.bindVertexArray(null);
  }

  resize(): void { /* noop */ }

  dispose(): void {
    this.freeGPU();
    this.shader?.destroy();
    this.shader = null;
    this.gl = null;
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  setData(data: Scatter3DData, gl: WebGL2RenderingContext, flatten = false, hiddenLabels?: Set<string>, colorMode: 'cell-set' | 'expression' = 'cell-set'): void {
    if (!this.gl) this.gl = gl;
    this.freeGPU();

    const n = data.x.length;
    this.pointCount = n;
    this.labels = data.labels ? Array.from(data.labels) : null;

    // Build full positions + colors (all points — visibility handled on GPU)
    const positions = new Float32Array(n * 3);
    const colors = new Float32Array(n * 4);

    const labelMap = new Map<string, number>();
    if (data.labels && !data.colors) {
      for (const label of data.labels) {
        if (!labelMap.has(label)) labelMap.set(label, labelMap.size);
      }
    }

    for (let i = 0; i < n; i++) {
      positions[i * 3] = data.x[i]!;
      positions[i * 3 + 1] = data.y[i]!;
      positions[i * 3 + 2] = flatten ? 0 : data.z[i]!;

      if (colorMode === 'expression' && data.values) {
        const v = data.values[i] ?? 0;
        colors[i * 4]     = viridisR(v);
        colors[i * 4 + 1] = viridisG(v);
        colors[i * 4 + 2] = viridisB(v);
        colors[i * 4 + 3] = 1;
      } else if (data.colors && data.colors.length === n) {
        const c = hexToRGBA(data.colors[i]!);
        colors[i * 4] = c[0]; colors[i * 4 + 1] = c[1];
        colors[i * 4 + 2] = c[2]; colors[i * 4 + 3] = c[3];
      } else if (data.labels) {
        const label = data.labels[i] ?? '';
        const c = hexToRGBA(CLUSTER_PALETTE[labelMap.get(label)! % CLUSTER_PALETTE.length]!);
        colors[i * 4] = c[0]; colors[i * 4 + 1] = c[1];
        colors[i * 4 + 2] = c[2]; colors[i * 4 + 3] = c[3];
      } else {
        colors[i * 4] = 0.376; colors[i * 4 + 1] = 0.510;
        colors[i * 4 + 2] = 0.953; colors[i * 4 + 3] = 1;
      }
    }

    // Build initial visibility mask
    this.visBytes = new Uint8Array(n);
    this.visBytes.fill(1);
    if (hiddenLabels && hiddenLabels.size > 0 && data.labels) {
      for (let i = 0; i < n; i++) {
        if (hiddenLabels.has(data.labels[i]!)) this.visBytes[i] = 0;
      }
    }

    // Upload to GPU
    this.vao = gl.createVertexArray()!;
    gl.bindVertexArray(this.vao);

    this.posBuffer = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);

    this.colorBuffer = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.colorBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, colors, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 0, 0);

    this.visBuffer = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.visBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.visBytes, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(2);
    // UNSIGNED_BYTE with normalized=true → 0/1 in shader as float
    gl.vertexAttribPointer(2, 1, gl.UNSIGNED_BYTE, true, 0, 0);

    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
  }

  /**
   * Update per-point visibility without re-uploading positions/colors.
   * O(nPoints) CPU (1 byte per point) + one bufferSubData call.
   */
  setVisibility(hiddenLabels: Set<string>): void {
    const gl = this.gl;
    if (!gl || !this.labels || !this.visBytes || !this.visBuffer) return;
    const n = this.labels.length;
    if (hiddenLabels.size === 0) {
      this.visBytes.fill(1);
    } else {
      for (let i = 0; i < n; i++) {
        this.visBytes[i] = hiddenLabels.has(this.labels[i]!) ? 0 : 1;
      }
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, this.visBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.visBytes);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
  }

  /** Get the label→color mapping for legend */
  getLabelColors(data: Scatter3DData): Array<{ label: string; color: string }> {
    if (!data.labels) return [];
    const seen = new Map<string, string>();
    for (const label of data.labels) {
      if (!seen.has(label)) {
        seen.set(label, CLUSTER_PALETTE[seen.size % CLUSTER_PALETTE.length]!);
      }
    }
    return Array.from(seen.entries()).map(([label, color]) => ({ label, color }));
  }

  // ─── Private ───────────────────────────────────────────────────────────────

  private freeGPU(): void {
    const gl = this.gl;
    if (!gl) return;
    if (this.vao) { gl.deleteVertexArray(this.vao); this.vao = null; }
    if (this.posBuffer) { gl.deleteBuffer(this.posBuffer); this.posBuffer = null; }
    if (this.colorBuffer) { gl.deleteBuffer(this.colorBuffer); this.colorBuffer = null; }
    if (this.visBuffer) { gl.deleteBuffer(this.visBuffer); this.visBuffer = null; }
    this.labels = null;
    this.visBytes = null;
  }
}
