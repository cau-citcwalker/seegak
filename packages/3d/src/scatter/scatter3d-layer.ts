import type { RenderLayer, RenderEngine, RenderState } from '@seegak/core';
import { ShaderProgram, colorScaleToTexture, VIRIDIS } from '@seegak/core';
import type { Scatter3DData, Scatter3DOptions } from '../types.js';
import type { Mat4 } from '../math/mat4.js';
import { mat4Multiply } from '../math/mat4.js';

// ─── Shaders ─────────────────────────────────────────────────────────────────

const SCATTER3D_VERT = /* glsl */ `#version 300 es
precision highp float;

layout(location = 0) in vec3 a_position;
layout(location = 1) in vec4 a_color;

uniform mat4 u_mvp;
uniform float u_pointSize;

out vec4 v_color;

void main() {
  gl_Position = u_mvp * vec4(a_position, 1.0);
  // Scale point size by depth so distant points are smaller
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

  setData(data: Scatter3DData, gl: WebGL2RenderingContext, flatten = false): void {
    if (!this.gl) this.gl = gl;
    this.freeGPU();

    const n = data.x.length;
    this.pointCount = n;

    // Build interleaved position buffer (xyz)
    const positions = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      positions[i * 3] = data.x[i]!;
      positions[i * 3 + 1] = data.y[i]!;
      positions[i * 3 + 2] = flatten ? 0 : data.z[i]!;
    }

    // Build color buffer (rgba)
    const colors = new Float32Array(n * 4);
    if (data.colors && data.colors.length === n) {
      for (let i = 0; i < n; i++) {
        const c = hexToRGBA(data.colors[i]!);
        colors[i * 4] = c[0]; colors[i * 4 + 1] = c[1];
        colors[i * 4 + 2] = c[2]; colors[i * 4 + 3] = c[3];
      }
    } else if (data.labels) {
      // Assign palette colors by label
      const labelMap = new Map<string, number>();
      for (let i = 0; i < n; i++) {
        const label = data.labels[i] ?? '';
        if (!labelMap.has(label)) labelMap.set(label, labelMap.size);
        const c = hexToRGBA(CLUSTER_PALETTE[labelMap.get(label)! % CLUSTER_PALETTE.length]!);
        colors[i * 4] = c[0]; colors[i * 4 + 1] = c[1];
        colors[i * 4 + 2] = c[2]; colors[i * 4 + 3] = c[3];
      }
    } else {
      // Default: light blue
      for (let i = 0; i < n; i++) {
        colors[i * 4] = 0.376; colors[i * 4 + 1] = 0.510;
        colors[i * 4 + 2] = 0.953; colors[i * 4 + 3] = 1;
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

    gl.bindVertexArray(null);
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
  }
}
