import type { RenderLayer, RenderEngine, RenderState } from '@seegak/core';
import { ShaderProgram, colorScaleToTexture, VIRIDIS, PLASMA, INFERNO } from '@seegak/core';
import type { ColorScale } from '@seegak/core';
import type { VolumeData, VolumeOptions } from '../types.js';
import type { Mat4 } from '../math/mat4.js';
import { mat4Multiply, mat4Invert } from '../math/mat4.js';

// ─── Shaders ─────────────────────────────────────────────────────────────────

const VOLUME_VERT = /* glsl */ `#version 300 es
layout(location = 0) in vec2 a_position;
out vec3 v_rayOrigin;
out vec3 v_rayDir;
uniform mat4 u_invProjView;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
  vec4 near = u_invProjView * vec4(a_position, -1.0, 1.0);
  vec4 far  = u_invProjView * vec4(a_position,  1.0, 1.0);
  v_rayOrigin = near.xyz / near.w;
  v_rayDir = normalize(far.xyz / far.w - v_rayOrigin);
}
`;

const VOLUME_FRAG = /* glsl */ `#version 300 es
precision highp float;
precision highp sampler3D;

in vec3 v_rayOrigin;
in vec3 v_rayDir;

uniform sampler3D u_volume;
uniform sampler2D u_lut;
uniform float u_isoValue;
uniform int u_mode;
uniform vec3 u_clipMin;
uniform vec3 u_clipMax;
uniform float u_opacity;

out vec4 fragColor;

// Ray-AABB intersection for [0,1]^3 box
vec2 intersectBox(vec3 orig, vec3 dir) {
  vec3 tMin = (vec3(0.0) - orig) / dir;
  vec3 tMax = (vec3(1.0) - orig) / dir;
  vec3 t1 = min(tMin, tMax);
  vec3 t2 = max(tMin, tMax);
  float tNear = max(max(t1.x, t1.y), t1.z);
  float tFar  = min(min(t2.x, t2.y), t2.z);
  return vec2(tNear, tFar);
}

void main() {
  vec2 tHit = intersectBox(v_rayOrigin, v_rayDir);
  if (tHit.x >= tHit.y) { fragColor = vec4(0.0); return; }
  tHit.x = max(tHit.x, 0.0);

  float stepSize = 0.005;
  int nSteps = int((tHit.y - tHit.x) / stepSize);
  nSteps = min(nSteps, 512);

  float maxVal = 0.0;
  vec4 accumColor = vec4(0.0);
  bool isoHit = false;
  vec3 isoPos = vec3(0.0);

  for (int i = 0; i < nSteps; i++) {
    vec3 pos = v_rayOrigin + v_rayDir * (tHit.x + float(i) * stepSize);
    // Clip check
    if (any(lessThan(pos, u_clipMin)) || any(greaterThan(pos, u_clipMax))) continue;

    float val = texture(u_volume, pos).r;

    if (u_mode == 0) { // MIP
      maxVal = max(maxVal, val);
    } else if (u_mode == 1) { // X-ray
      vec4 col = texture(u_lut, vec2(val, 0.5));
      accumColor.rgb += (1.0 - accumColor.a) * col.rgb * col.a * u_opacity;
      accumColor.a   += (1.0 - accumColor.a) * col.a * u_opacity;
      if (accumColor.a > 0.99) break;
    } else { // ISO
      if (!isoHit && val >= u_isoValue) { isoHit = true; isoPos = pos; break; }
    }
  }

  if (u_mode == 0) {
    fragColor = texture(u_lut, vec2(maxVal, 0.5));
    fragColor.a *= u_opacity;
  } else if (u_mode == 1) {
    fragColor = accumColor;
  } else {
    if (isoHit) {
      float d = 0.01;
      float nx = texture(u_volume, isoPos + vec3(d,0,0)).r - texture(u_volume, isoPos - vec3(d,0,0)).r;
      float ny = texture(u_volume, isoPos + vec3(0,d,0)).r - texture(u_volume, isoPos - vec3(0,d,0)).r;
      float nz = texture(u_volume, isoPos + vec3(0,0,d)).r - texture(u_volume, isoPos - vec3(0,0,d)).r;
      vec3 normal = normalize(vec3(nx, ny, nz));
      vec3 lightDir = normalize(vec3(1.0, 1.0, 1.0));
      float diffuse = max(dot(normal, lightDir), 0.0);
      vec4 baseColor = texture(u_lut, vec2(u_isoValue, 0.5));
      fragColor = vec4(baseColor.rgb * (0.3 + 0.7 * diffuse), u_opacity);
    } else {
      fragColor = vec4(0.0);
    }
  }
}
`;

// ─── Colour-scale helpers ─────────────────────────────────────────────────────

const GRAYS: ColorScale = {
  stops: [
    { position: 0.0, color: { r: 0, g: 0, b: 0, a: 0 } },
    { position: 1.0, color: { r: 1, g: 1, b: 1, a: 1 } },
  ],
};

function resolveColorScale(name: VolumeOptions['colorScale']): ColorScale {
  switch (name) {
    case 'plasma':  return PLASMA;
    case 'inferno': return INFERNO;
    case 'grays':   return GRAYS;
    case 'viridis':
    default:
      return VIRIDIS;
  }
}

function modeIndex(mode: VolumeOptions['renderMode']): number {
  switch (mode) {
    case 'xray': return 1;
    case 'iso':  return 2;
    default:     return 0; // 'mip'
  }
}

// ─── VolumeLayer ──────────────────────────────────────────────────────────────

export class VolumeLayer implements RenderLayer {
  readonly id = 'volume';
  readonly order = 0;

  // Injected by VolumeView before first render
  viewMatrix: Mat4 | null = null;
  projMatrix: Mat4 | null = null;

  private gl: WebGL2RenderingContext | null = null;
  private shader: ShaderProgram | null = null;

  // Quad geometry
  private vao: WebGLVertexArrayObject | null = null;
  private quadBuffer: WebGLBuffer | null = null;

  private initialized = false;

  // Textures managed internally (TextureManager is 2-D only)
  private volumeTex: WebGLTexture | null = null;
  private lutTex: WebGLTexture | null = null;
  // Texture units we own
  private readonly VOLUME_UNIT = 0;
  private readonly LUT_UNIT    = 1;

  // Render state
  private renderMode: VolumeOptions['renderMode'] = 'mip';
  private isoValue:   number = 0.5;
  private opacity:    number = 0.8;
  private clipMin:    [number, number, number] = [0, 0, 0];
  private clipMax:    [number, number, number] = [1, 1, 1];
  private colorScale: VolumeOptions['colorScale'] = 'viridis';

  // Full-screen quad vertices in clip space
  private static readonly QUAD_VERTS = new Float32Array([
    -1, -1,   1, -1,  -1,  1,
    -1,  1,   1, -1,   1,  1,
  ]);

  // ─── RenderLayer interface ─────────────────────────────────────────────────

  render(engine: RenderEngine, _state: RenderState): void {
    const gl = engine.gl;

    // One-time GPU initialisation
    if (!this.initialized) {
      this.gl = gl;
      this.initialized = true;
      this.initGL(gl, engine);
    }

    if (!this.shader || !this.vao || !this.volumeTex || !this.lutTex) return;
    if (!this.viewMatrix || !this.projMatrix) return;

    // Compute inverse(proj * view)
    const projView    = mat4Multiply(this.projMatrix, this.viewMatrix);
    const invProjView = mat4Invert(projView);
    if (!invProjView) return;

    this.shader.use();

    // Uniforms
    const loc = (name: string) => gl.getUniformLocation(this.shader!.program, name);

    gl.uniformMatrix4fv(loc('u_invProjView'), false, invProjView);
    gl.uniform1i(loc('u_mode'),    modeIndex(this.renderMode));
    gl.uniform1f(loc('u_isoValue'), this.isoValue);
    gl.uniform1f(loc('u_opacity'),  this.opacity);
    gl.uniform3fv(loc('u_clipMin'), this.clipMin);
    gl.uniform3fv(loc('u_clipMax'), this.clipMax);

    // Bind 3-D volume texture to unit 0
    gl.activeTexture(gl.TEXTURE0 + this.VOLUME_UNIT);
    gl.bindTexture(gl.TEXTURE_3D, this.volumeTex);
    gl.uniform1i(loc('u_volume'), this.VOLUME_UNIT);

    // Bind LUT texture to unit 1
    gl.activeTexture(gl.TEXTURE0 + this.LUT_UNIT);
    gl.bindTexture(gl.TEXTURE_2D, this.lutTex);
    gl.uniform1i(loc('u_lut'), this.LUT_UNIT);

    // Draw full-screen quad (2 triangles = 6 vertices)
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.bindVertexArray(null);
  }

  resize(_width: number, _height: number): void {
    // Full-screen quad never needs updating — it's always clip-space [-1,1]^2
  }

  dispose(): void {
    const gl = this.gl;
    if (!gl) return;

    if (this.volumeTex) { gl.deleteTexture(this.volumeTex); this.volumeTex = null; }
    if (this.lutTex)    { gl.deleteTexture(this.lutTex);    this.lutTex    = null; }
    if (this.quadBuffer){ gl.deleteBuffer(this.quadBuffer); this.quadBuffer = null; }
    if (this.vao)       { gl.deleteVertexArray(this.vao);   this.vao       = null; }
    this.shader?.destroy();
    this.shader = null;
    this.gl = null;
  }

  // ─── Public API (called by VolumeView) ────────────────────────────────────

  /** Upload new volume data to GPU. */
  setData(data: VolumeData, gl: WebGL2RenderingContext): void {
    // Store gl reference for lazy init path
    if (!this.gl) this.gl = gl;

    // Delete any existing 3-D texture
    if (this.volumeTex) {
      gl.deleteTexture(this.volumeTex);
      this.volumeTex = null;
    }

    const tex = gl.createTexture();
    if (!tex) throw new Error('Failed to create TEXTURE_3D');
    this.volumeTex = tex;

    gl.activeTexture(gl.TEXTURE0 + this.VOLUME_UNIT);
    gl.bindTexture(gl.TEXTURE_3D, tex);

    const { width, height, depth, dtype, buffer } = data;

    if (dtype === 'uint8') {
      const pixels = new Uint8Array(buffer);
      gl.texImage3D(gl.TEXTURE_3D, 0, gl.R8, width, height, depth, 0, gl.RED, gl.UNSIGNED_BYTE, pixels);
    } else if (dtype === 'uint16') {
      const pixels = new Uint16Array(buffer);
      gl.texImage3D(gl.TEXTURE_3D, 0, gl.R16UI, width, height, depth, 0, gl.RED_INTEGER, gl.UNSIGNED_SHORT, pixels);
    } else {
      // float32
      const pixels = new Float32Array(buffer);
      gl.texImage3D(gl.TEXTURE_3D, 0, gl.R32F, width, height, depth, 0, gl.RED, gl.FLOAT, pixels);
    }

    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);

    gl.bindTexture(gl.TEXTURE_3D, null);
  }

  setRenderMode(mode: VolumeOptions['renderMode']): void {
    this.renderMode = mode;
  }

  setIsoValue(v: number): void {
    this.isoValue = Math.max(0, Math.min(1, v));
  }

  setOpacity(v: number): void {
    this.opacity = Math.max(0, Math.min(1, v));
  }

  setClip(
    x: [number, number],
    y: [number, number],
    z: [number, number],
  ): void {
    this.clipMin = [x[0], y[0], z[0]];
    this.clipMax = [x[1], y[1], z[1]];
  }

  setColorScale(name: VolumeOptions['colorScale'], gl: WebGL2RenderingContext): void {
    this.colorScale = name;
    this.rebuildLUT(gl);
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private initGL(gl: WebGL2RenderingContext, engine: RenderEngine): void {
    // Compile shader
    this.shader = engine.createShader('volume', { vertex: VOLUME_VERT, fragment: VOLUME_FRAG });

    // Full-screen quad VAO
    this.vao = gl.createVertexArray()!;
    gl.bindVertexArray(this.vao);

    this.quadBuffer = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, VolumeLayer.QUAD_VERTS, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);

    // Build the initial LUT
    this.rebuildLUT(gl);
  }

  private rebuildLUT(gl: WebGL2RenderingContext): void {
    if (this.lutTex) {
      gl.deleteTexture(this.lutTex);
      this.lutTex = null;
    }

    const scale   = resolveColorScale(this.colorScale);
    const lutData = colorScaleToTexture(scale);

    const tex = gl.createTexture();
    if (!tex) throw new Error('Failed to create LUT texture');
    this.lutTex = tex;

    gl.activeTexture(gl.TEXTURE0 + this.LUT_UNIT);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(
      gl.TEXTURE_2D, 0, gl.RGBA32F,
      256, 1, 0,
      gl.RGBA, gl.FLOAT, lutData,
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }
}
