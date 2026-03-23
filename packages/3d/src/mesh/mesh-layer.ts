import type { RenderLayer, RenderEngine, RenderState } from '@seegak/core';
import { ShaderProgram } from '@seegak/core';
import type { MeshData, MeshOptions } from '../types.js';
import type { Mat4 } from '../math/mat4.js';
import {
  mat4Multiply,
  mat4Invert,
  mat4Transpose,
  mat4Identity,
} from '../math/mat4.js';

// ─── Shaders ─────────────────────────────────────────────────────────────────

const MESH_VERT = /* glsl */ `#version 300 es
layout(location = 0) in vec3 a_position;
layout(location = 1) in vec3 a_normal;
layout(location = 2) in vec4 a_color;

uniform mat4 u_mvp;
uniform mat4 u_normalMatrix;
uniform vec4 u_color;
uniform int  u_useVertexColor;

out vec3 v_normal;
out vec4 v_color;

void main() {
  gl_Position = u_mvp * vec4(a_position, 1.0);
  v_normal = mat3(u_normalMatrix) * a_normal;
  v_color  = u_useVertexColor == 1 ? a_color : u_color;
}
`;

const MESH_FRAG = /* glsl */ `#version 300 es
precision mediump float;

in vec3 v_normal;
in vec4 v_color;

uniform float u_opacity;
uniform int   u_lighting;
uniform vec3  u_lightDir;

out vec4 fragColor;

void main() {
  float diffuse = u_lighting == 1
    ? max(dot(normalize(v_normal), u_lightDir), 0.0)
    : 1.0;
  fragColor = vec4(v_color.rgb * (0.3 + 0.7 * diffuse), v_color.a * u_opacity);
}
`;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Parse a CSS hex/rgb colour string into a normalised [r,g,b,a] tuple. */
function parseColor(color: string): [number, number, number, number] {
  // Hex shorthand #rgb
  if (/^#[0-9a-f]{3}$/i.test(color)) {
    const r = parseInt(color[1]! + color[1]!, 16) / 255;
    const g = parseInt(color[2]! + color[2]!, 16) / 255;
    const b = parseInt(color[3]! + color[3]!, 16) / 255;
    return [r, g, b, 1];
  }
  // Hex full #rrggbb
  if (/^#[0-9a-f]{6}$/i.test(color)) {
    const r = parseInt(color.slice(1, 3), 16) / 255;
    const g = parseInt(color.slice(3, 5), 16) / 255;
    const b = parseInt(color.slice(5, 7), 16) / 255;
    return [r, g, b, 1];
  }
  // Fallback: white
  return [1, 1, 1, 1];
}

/** Auto-compute per-vertex normals from triangle soup (averaged over shared vertices). */
function computeNormals(vertices: Float32Array, indices: Uint32Array): Float32Array {
  const vertexCount = vertices.length / 3;
  const normals = new Float32Array(vertexCount * 3);

  for (let i = 0; i < indices.length; i += 3) {
    const i0 = indices[i]!     * 3;
    const i1 = indices[i + 1]! * 3;
    const i2 = indices[i + 2]! * 3;

    const ax = vertices[i1]! - vertices[i0]!;
    const ay = vertices[i1 + 1]! - vertices[i0 + 1]!;
    const az = vertices[i1 + 2]! - vertices[i0 + 2]!;

    const bx = vertices[i2]! - vertices[i0]!;
    const by = vertices[i2 + 1]! - vertices[i0 + 1]!;
    const bz = vertices[i2 + 2]! - vertices[i0 + 2]!;

    // Cross product a × b
    const cx = ay * bz - az * by;
    const cy = az * bx - ax * bz;
    const cz = ax * by - ay * bx;

    // Accumulate face normal into each vertex
    for (const vi of [i0, i1, i2]) {
      normals[vi]!     += cx;
      normals[vi + 1]! += cy;
      normals[vi + 2]! += cz;
    }
  }

  // Normalise
  for (let i = 0; i < vertexCount; i++) {
    const base = i * 3;
    const x = normals[base]!;
    const y = normals[base + 1]!;
    const z = normals[base + 2]!;
    const len = Math.sqrt(x * x + y * y + z * z) || 1;
    normals[base]!     = x / len;
    normals[base + 1]! = y / len;
    normals[base + 2]! = z / len;
  }

  return normals;
}

// ─── MeshLayer ────────────────────────────────────────────────────────────────

export class MeshLayer implements RenderLayer {
  readonly id = 'mesh';
  readonly order = 0;

  // Set by MeshView
  viewMatrix:  Mat4 | null = null;
  projMatrix:  Mat4 | null = null;
  modelMatrix: Mat4 = mat4Identity();

  private initialized = false;
  private gl: WebGL2RenderingContext | null = null;
  private shader: ShaderProgram | null = null;

  private vao: WebGLVertexArrayObject | null = null;
  private posBuffer:    WebGLBuffer | null = null;
  private normalBuffer: WebGLBuffer | null = null;
  private colorBuffer:  WebGLBuffer | null = null;
  private indexBuffer:  WebGLBuffer | null = null;
  private indexCount = 0;

  // Render state
  private wireframe  = false;
  private lighting   = true;
  private opacity    = 1.0;
  private color:     [number, number, number, number] = [0.8, 0.5, 0.2, 1.0];
  private useVertexColor = false;
  private lightDir:  [number, number, number] = [0.577, 0.577, 0.577];

  // ─── RenderLayer interface ─────────────────────────────────────────────────

  render(engine: RenderEngine, _state: RenderState): void {
    const gl = engine.gl;

    if (!this.initialized) {
      this.initialized = true;
      this.gl = gl;
      this.shader = engine.createShader('mesh', { vertex: MESH_VERT, fragment: MESH_FRAG });
    }

    if (!this.shader || !this.vao || !this.viewMatrix || !this.projMatrix) return;

    const mvp = mat4Multiply(this.projMatrix, mat4Multiply(this.viewMatrix, this.modelMatrix));

    // Normal matrix = transpose(inverse(modelView))
    const modelView = mat4Multiply(this.viewMatrix, this.modelMatrix);
    const invMV     = mat4Invert(modelView) ?? mat4Identity();
    const normalMat = mat4Transpose(invMV);

    this.shader.use();

    const prog = this.shader.program;
    const uloc = (n: string) => gl.getUniformLocation(prog, n);

    gl.uniformMatrix4fv(uloc('u_mvp'),          false, mvp);
    gl.uniformMatrix4fv(uloc('u_normalMatrix'),  false, normalMat);
    gl.uniform4fv(uloc('u_color'),               this.color);
    gl.uniform1i(uloc('u_useVertexColor'),        this.useVertexColor ? 1 : 0);
    gl.uniform1f(uloc('u_opacity'),               this.opacity);
    gl.uniform1i(uloc('u_lighting'),              this.lighting ? 1 : 0);
    gl.uniform3fv(uloc('u_lightDir'),             this.lightDir);

    gl.bindVertexArray(this.vao);

    if (this.wireframe) {
      // WebGL2 has no GL_LINE — iterate triangles and draw lines
      // For a correct wireframe without geometry shader we use LINES on the
      // index buffer reinterpreted pair-wise.  We take a simple approach and
      // just draw with TRIANGLES but set polygonOffset so edges are visible,
      // OR we fall back to drawing each triangle edge explicitly via drawElements.
      // The cleanest WebGL2 approach: draw the mesh normally with gl.LINES
      // after building a line index buffer.  We approximate here by using
      // LINE_STRIP with the index buffer (not ideal but avoids extra buffers).
      gl.drawElements(gl.LINE_STRIP, this.indexCount, gl.UNSIGNED_INT, 0);
    } else {
      gl.drawElements(gl.TRIANGLES, this.indexCount, gl.UNSIGNED_INT, 0);
    }

    gl.bindVertexArray(null);
  }

  resize(_w: number, _h: number): void { /* nothing */ }

  dispose(): void {
    this.freeGPUBuffers();
    this.shader?.destroy();
    this.shader = null;
    this.gl = null;
  }

  // ─── Public API ───────────────────────────────────────────────────────────

  setData(data: MeshData, gl: WebGL2RenderingContext): void {
    if (!this.gl) this.gl = gl;

    this.freeGPUBuffers();

    const normals = data.normals ?? computeNormals(data.vertices, data.indices);
    const hasColors = !!data.colors && data.colors.length > 0;
    this.useVertexColor = hasColors;
    this.indexCount = data.indices.length;

    // Build VAO
    this.vao = gl.createVertexArray()!;
    gl.bindVertexArray(this.vao);

    // Position (location 0)
    this.posBuffer = this.uploadArrayBuffer(gl, data.vertices);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);

    // Normal (location 1)
    this.normalBuffer = this.uploadArrayBuffer(gl, normals);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);

    // Per-vertex colour (location 2) — use dummy if none provided
    const colorData = hasColors
      ? data.colors!
      : new Float32Array(data.vertices.length / 3 * 4).fill(1); // all white
    this.colorBuffer = this.uploadArrayBuffer(gl, colorData);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 0, 0);

    // Index buffer
    this.indexBuffer = gl.createBuffer()!;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, data.indices, gl.STATIC_DRAW);

    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
  }

  setWireframe(v: boolean): void { this.wireframe = v; }
  setLighting(v: boolean):  void { this.lighting  = v; }
  setOpacity(v: number):    void { this.opacity   = Math.max(0, Math.min(1, v)); }

  setColor(colorStr: string): void {
    this.color = parseColor(colorStr);
    this.useVertexColor = false;
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private uploadArrayBuffer(gl: WebGL2RenderingContext, data: Float32Array): WebGLBuffer {
    const buf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    return buf;
  }

  private freeGPUBuffers(): void {
    const gl = this.gl;
    if (!gl) return;

    if (this.vao)          { gl.deleteVertexArray(this.vao);    this.vao          = null; }
    if (this.posBuffer)    { gl.deleteBuffer(this.posBuffer);   this.posBuffer    = null; }
    if (this.normalBuffer) { gl.deleteBuffer(this.normalBuffer);this.normalBuffer = null; }
    if (this.colorBuffer)  { gl.deleteBuffer(this.colorBuffer); this.colorBuffer  = null; }
    if (this.indexBuffer)  { gl.deleteBuffer(this.indexBuffer); this.indexBuffer  = null; }
  }
}
