import type { RenderLayer, RenderEngine, RenderState } from '@seegak/core';
import { cameraMatrix } from '@seegak/core';

// ─── Shaders ───

/**
 * Image tile vertex shader.
 * Inputs:
 *   location 0 — a_pos:    vec2 quad corner in physical coords
 *   location 1 — a_uv:     vec2 texture UV for this corner
 *
 * u_matrix transforms physical → NDC (same cameraMatrix used across all layers).
 * u_channel  selects which LUT texture to sample.
 */
const IMAGE_VERT = `#version 300 es
precision highp float;

layout(location = 0) in vec2 a_pos;
layout(location = 1) in vec2 a_uv;

uniform mat4 u_matrix;

out vec2 v_uv;

void main() {
  gl_Position = u_matrix * vec4(a_pos, 0.0, 1.0);
  v_uv = a_uv;
}
`;

/**
 * Image tile fragment shader.
 * Samples the tile texture (luminance encoded in .r), looks up the per-channel
 * LUT texture (256×1 RGBA32F) and accumulates the result additively so that
 * multiple channels blend together on screen.
 *
 * u_lut    — 256×1 RGBA32F LUT for this channel (black → channel color)
 * u_tile   — 2D tile texture (single-channel, stored in .r)
 * u_opacity— overall layer opacity
 */
const IMAGE_FRAG = `#version 300 es
precision highp float;

in vec2 v_uv;

uniform sampler2D u_tile;
uniform sampler2D u_lut;
uniform float u_opacity;

out vec4 fragColor;

void main() {
  float raw = texture(u_tile, v_uv).r;
  vec4 mapped = texture(u_lut, vec2(raw, 0.5));
  fragColor = vec4(mapped.rgb * mapped.a, mapped.a * u_opacity);
}
`;

// ─── Per-tile GPU resource ───

interface TileGPU {
  texture: WebGLTexture;
  /** Physical quad: [x0,y0, x1,y0, x0,y1, x1,y1] */
  posBuffer: WebGLBuffer;
  uvBuffer:  WebGLBuffer;
}

// ─── Layer ───

/**
 * ImageLayer renders pyramidal image tiles with per-channel LUT textures.
 * Uses additive blending so multiple channels composites naturally.
 */
export class ImageLayer implements RenderLayer {
  id    = 'spatial-image';
  order = 0;            // drawn first (background)

  private tileGPU     = new Map<string, TileGPU>();
  private lutTextures : WebGLTexture[]   = [];
  private lutUnits    : number[]         = [];
  private nChannels   = 0;
  private opacity     = 1.0;

  /** Physical coordinate extents for the whole image [xMin,yMin,xMax,yMax] */
  private imageBounds: [number, number, number, number] = [0, 0, 1, 1];
  private imageWidth  = 1;
  private imageHeight = 1;
  private tileSize    = 256;

  // VAO shared for all quads (positions + uvs change per-tile but we rebind)
  private shaderKey = 'spatial-image';

  // ── Setup ──

  init(engine: RenderEngine): void {
    engine.createShader(this.shaderKey, { vertex: IMAGE_VERT, fragment: IMAGE_FRAG });
  }

  setImageInfo(
    imageBounds: [number, number, number, number],
    imageWidth: number,
    imageHeight: number,
    tileSize: number,
  ): void {
    this.imageBounds = imageBounds;
    this.imageWidth  = imageWidth;
    this.imageHeight = imageHeight;
    this.tileSize    = tileSize;
  }

  setOpacity(opacity: number): void {
    this.opacity = opacity;
  }

  // ── LUT management ──

  /**
   * Upload per-channel LUT textures.
   * Each lut is Float32Array(1024) = 256 RGBA entries.
   */
  setChannelLuts(gl: WebGL2RenderingContext, luts: Float32Array[]): void {
    // Delete old LUT textures
    for (const tex of this.lutTextures) gl.deleteTexture(tex);
    this.lutTextures = [];
    this.lutUnits    = [];
    this.nChannels   = luts.length;

    // We manage our own texture units starting at a high base to avoid
    // collision with tile textures (tiles use units 0..nChannels-1,
    // LUTs use units nChannels..2*nChannels-1).
    const LUT_UNIT_BASE = 16;

    for (let c = 0; c < luts.length; c++) {
      const unit = LUT_UNIT_BASE + c;
      gl.activeTexture(gl.TEXTURE0 + unit);
      const tex = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(
        gl.TEXTURE_2D, 0, gl.RGBA32F, 256, 1, 0,
        gl.RGBA, gl.FLOAT, luts[c]!,
      );
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      this.lutTextures.push(tex);
      this.lutUnits.push(unit);
    }
  }

  // ── Tile management ──

  /**
   * Upload a decoded tile's pixel data to a WebGL texture.
   * key format: `${level}/${channel}/${tx}/${ty}`
   */
  updateTile(
    gl: WebGL2RenderingContext,
    key: string,
    data: ArrayBuffer,
    width: number,
    height: number,
    dtype: string,
    /** Physical coordinate quad for this tile [xMin, yMin, xMax, yMax] */
    physBounds: [number, number, number, number],
    channelIndex: number,
  ): void {
    // Determine GL type from dtype
    let glType: number;
    let glInternalFormat: number;
    let glFormat: number;
    let pixelData: ArrayBufferView;

    switch (dtype) {
      case 'float32':
        glType           = gl.FLOAT;
        glInternalFormat = gl.R32F;
        glFormat         = gl.RED;
        pixelData        = new Float32Array(data);
        break;
      case 'uint16': {
        // Normalize uint16 (0–65535) to float32 (0–1) so the tile shader
        // can sample with texture() and the LUT index remains in [0,1].
        glType           = gl.FLOAT;
        glInternalFormat = gl.R32F;
        glFormat         = gl.RED;
        const u16        = new Uint16Array(data);
        const f32        = new Float32Array(u16.length);
        for (let k = 0; k < u16.length; k++) f32[k] = u16[k]! / 65535;
        pixelData        = f32;
        break;
      }
      case 'uint8':
      default:
        glType           = gl.UNSIGNED_BYTE;
        glInternalFormat = gl.R8;
        glFormat         = gl.RED;
        pixelData        = new Uint8Array(data);
        break;
    }

    // Create or update GPU tile
    let gpu = this.tileGPU.get(key);

    if (!gpu) {
      // Allocate texture
      const unit = channelIndex; // tiles use units 0..nChannels-1
      gl.activeTexture(gl.TEXTURE0 + unit);
      const tex = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

      // Allocate quad buffers
      const posBuffer = gl.createBuffer()!;
      const uvBuffer  = gl.createBuffer()!;

      gpu = { texture: tex, posBuffer, uvBuffer };
      this.tileGPU.set(key, gpu);

      // Upload vertex data for the quad (two triangles as a strip)
      const [x0, y0, x1, y1] = physBounds;
      const positions = new Float32Array([
        x0, y0,
        x1, y0,
        x0, y1,
        x1, y1,
      ]);
      gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

      const uvs = new Float32Array([
        0, 0,
        1, 0,
        0, 1,
        1, 1,
      ]);
      gl.bindBuffer(gl.ARRAY_BUFFER, uvBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, uvs, gl.STATIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
    }

    // Upload pixel data
    gl.activeTexture(gl.TEXTURE0 + channelIndex);
    gl.bindTexture(gl.TEXTURE_2D, gpu.texture);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(
      gl.TEXTURE_2D, 0, glInternalFormat,
      width, height, 0,
      glFormat, glType, pixelData,
    );
  }

  removeTile(gl: WebGL2RenderingContext, key: string): void {
    const gpu = this.tileGPU.get(key);
    if (!gpu) return;
    gl.deleteTexture(gpu.texture);
    gl.deleteBuffer(gpu.posBuffer);
    gl.deleteBuffer(gpu.uvBuffer);
    this.tileGPU.delete(key);
  }

  // ── RenderLayer interface ──

  render(engine: RenderEngine, state: RenderState): void {
    if (this.tileGPU.size === 0 || this.lutTextures.length === 0) return;

    const gl     = engine.gl;
    const shader = engine.getShader(this.shaderKey);
    if (!shader) return;

    const matrix = cameraMatrix(state.viewport, state.camera);

    // Additive blending for multi-channel composition
    gl.blendFunc(gl.ONE, gl.ONE);

    shader.use();
    shader.setUniform('u_matrix',  { type: 'mat4',      value: matrix });
    shader.setUniform('u_opacity', { type: 'float',     value: this.opacity });

    for (let c = 0; c < this.nChannels; c++) {
      // Bind LUT texture for this channel
      const lutUnit = this.lutUnits[c];
      if (lutUnit === undefined) continue;
      gl.activeTexture(gl.TEXTURE0 + lutUnit);
      gl.bindTexture(gl.TEXTURE_2D, this.lutTextures[c]!);
      shader.setUniform('u_lut', { type: 'sampler2D', value: lutUnit });

      // Render all tiles that belong to this channel
      for (const [key, gpu] of this.tileGPU) {
        // Key format: `${level}/${channel}/${tx}/${ty}`
        const parts = key.split('/');
        if (parseInt(parts[1]!, 10) !== c) continue;

        // Bind tile texture to unit c
        gl.activeTexture(gl.TEXTURE0 + c);
        gl.bindTexture(gl.TEXTURE_2D, gpu.texture);
        shader.setUniform('u_tile', { type: 'sampler2D', value: c });

        // Bind position attribute (location 0)
        gl.bindBuffer(gl.ARRAY_BUFFER, gpu.posBuffer);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

        // Bind UV attribute (location 1)
        gl.bindBuffer(gl.ARRAY_BUFFER, gpu.uvBuffer);
        gl.enableVertexAttribArray(1);
        gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 0, 0);

        // Draw quad as triangle strip (4 vertices)
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }
    }

    gl.disableVertexAttribArray(0);
    gl.disableVertexAttribArray(1);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);

    // Restore standard alpha blending
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  }

  dispose(): void {
    // GPU resources are cleaned up via engine.destroy() which calls dispose()
    // Individual tiles are tracked by the layer; clean them up here
    this.tileGPU.clear();
    this.lutTextures = [];
    this.lutUnits    = [];
  }
}
