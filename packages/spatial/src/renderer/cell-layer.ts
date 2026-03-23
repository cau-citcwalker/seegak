import type { RenderLayer, RenderEngine, RenderState } from '@seegak/core';
import { cameraMatrix, hexToVec4 } from '@seegak/core';

// ─── Shaders ───

/**
 * Cell-dot vertex shader.
 * Physical coordinate system — u_matrix is the same cameraMatrix used elsewhere.
 *   location 0 — a_x:     float, x in physical coords
 *   location 1 — a_y:     float, y in physical coords
 *   location 2 — a_color: float, palette index (0-255, stored as UNSIGNED_SHORT)
 */
const CELL_VERT = `#version 300 es
precision highp float;

layout(location = 0) in float a_x;
layout(location = 1) in float a_y;
layout(location = 2) in float a_colorIdx;

uniform mat4 u_matrix;
uniform float u_pointSize;

out float v_colorIdx;

void main() {
  gl_Position = u_matrix * vec4(a_x, a_y, 0.0, 1.0);
  gl_PointSize = u_pointSize;
  v_colorIdx = a_colorIdx;
}
`;

/**
 * Cell-dot fragment shader.
 * Looks up color in a 256-entry palette texture (NEAREST sampling).
 * Draws soft anti-aliased circular points.
 */
const CELL_FRAG = `#version 300 es
precision highp float;

in float v_colorIdx;

uniform sampler2D u_palette;
uniform float u_opacity;

out vec4 fragColor;

void main() {
  vec2 cxy = 2.0 * gl_PointCoord - 1.0;
  float r = dot(cxy, cxy);
  if (r > 1.0) discard;

  float alpha = 1.0 - smoothstep(0.8, 1.0, r);

  vec4 color = texture(u_palette, vec2((v_colorIdx + 0.5) / 256.0, 0.5));
  fragColor = vec4(color.rgb, color.a * alpha * u_opacity);
}
`;

// ─── Palette builder helpers ───

const CLUSTER_PALETTE = [
  '#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd',
  '#8c564b', '#e377c2', '#7f7f7f', '#bcbd22', '#17becf',
  '#aec7e8', '#ffbb78', '#98df8a', '#ff9896', '#c5b0d5',
  '#c49c94', '#f7b6d2', '#c7c7c7', '#dbdb8d', '#9edae5',
];

// ─── Layer ───

/**
 * CellLayer renders per-cell scatter dots in physical coordinate space.
 * Supports cluster coloring via a 256-entry palette texture, point size,
 * and opacity control.
 */
export class CellLayer implements RenderLayer {
  id    = 'spatial-cells';
  order = 20;

  private pointCount = 0;
  private shaderKey  = 'spatial-cells';

  // Palette texture (managed manually since we need NEAREST filtering + RGBA32F)
  private paletteTex: WebGLTexture | null = null;
  private paletteUnit = 8;  // texture unit for the cell palette

  // ── Init ──

  init(engine: RenderEngine): void {
    engine.createShader(this.shaderKey, { vertex: CELL_VERT, fragment: CELL_FRAG });

    const gl = engine.gl;
    this.paletteTex = gl.createTexture()!;
    gl.activeTexture(gl.TEXTURE0 + this.paletteUnit);
    gl.bindTexture(gl.TEXTURE_2D, this.paletteTex);
    const empty = new Float32Array(256 * 4);
    gl.texImage2D(
      gl.TEXTURE_2D, 0, gl.RGBA32F, 256, 1, 0,
      gl.RGBA, gl.FLOAT, empty,
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    const shader = engine.getShader(this.shaderKey)!;
    shader.use();
    shader.setUniform('u_pointSize', { type: 'float', value: 4 });
    shader.setUniform('u_opacity',   { type: 'float', value: 0.8 });
  }

  // ── Data upload ──

  /**
   * Upload cell x/y positions and per-cell cluster color index.
   * @param x         Float32Array of physical x coordinates
   * @param y         Float32Array of physical y coordinates
   * @param labels    Optional per-cell cluster labels (used to build palette)
   * @param colors    Optional per-cell hex color strings (overrides palette)
   * @param engine    RenderEngine (for buffer management)
   */
  setData(
    engine: RenderEngine,
    x: Float32Array,
    y: Float32Array,
    labels?: string[],
    colors?: string[],
  ): void {
    const gl = engine.gl;
    const n  = x.length;

    engine.setBuffer('cells_x', { data: x, usage: 'dynamic', size: 1 });
    engine.setBuffer('cells_y', { data: y, usage: 'dynamic', size: 1 });

    // Build palette and color index buffer
    if (labels || colors) {
      const colorIdx   = new Uint16Array(n);
      const paletteRgba = new Float32Array(256 * 4);
      const colorMap   = new Map<string, number>(); // key → slot
      let slotCount    = 0;

      for (let i = 0; i < n; i++) {
        // Determine the color key for this point
        const hex = colors?.[i] ??
          CLUSTER_PALETTE[/* label slot */ 0] ??  // placeholder, filled below
          '#888888';
        const label = labels?.[i] ?? '';

        // Use label as map key (consistent coloring per cluster)
        const mapKey = label !== '' ? label : (colors?.[i] ?? '');
        let slot = colorMap.get(mapKey);
        if (slot === undefined) {
          slot = slotCount++;
          colorMap.set(mapKey, slot);

          // Determine color: explicit per-point > auto palette
          const effectiveHex = colors?.[i] ??
            CLUSTER_PALETTE[slot % CLUSTER_PALETTE.length]!;
          const c = hexToVec4(effectiveHex);
          paletteRgba[slot * 4 + 0] = c.r;
          paletteRgba[slot * 4 + 1] = c.g;
          paletteRgba[slot * 4 + 2] = c.b;
          paletteRgba[slot * 4 + 3] = c.a;
        }

        colorIdx[i] = slot;
      }

      // Upload color index as Uint16 vertex attribute
      engine.setBuffer('cells_coloridx', { data: colorIdx, usage: 'dynamic', size: 1 });

      // Upload palette texture
      if (this.paletteTex) {
        gl.activeTexture(gl.TEXTURE0 + this.paletteUnit);
        gl.bindTexture(gl.TEXTURE_2D, this.paletteTex);
        gl.texSubImage2D(
          gl.TEXTURE_2D, 0, 0, 0, 256, 1,
          gl.RGBA, gl.FLOAT, paletteRgba,
        );
      }
    } else {
      // Default: all cells the same color (white)
      const colorIdx = new Uint16Array(n); // all zeros
      engine.setBuffer('cells_coloridx', { data: colorIdx, usage: 'dynamic', size: 1 });

      if (this.paletteTex) {
        const defaultPalette = new Float32Array(256 * 4);
        defaultPalette[0] = defaultPalette[1] = defaultPalette[2] = defaultPalette[3] = 1.0;
        gl.activeTexture(gl.TEXTURE0 + this.paletteUnit);
        gl.bindTexture(gl.TEXTURE_2D, this.paletteTex);
        gl.texSubImage2D(
          gl.TEXTURE_2D, 0, 0, 0, 256, 1,
          gl.RGBA, gl.FLOAT, defaultPalette,
        );
      }
    }

    this.pointCount = n;
  }

  setPointSize(engine: RenderEngine, size: number): void {
    const shader = engine.getShader(this.shaderKey);
    if (shader) { shader.use(); shader.setUniform('u_pointSize', { type: 'float', value: size }); }
  }

  setOpacity(engine: RenderEngine, opacity: number): void {
    const shader = engine.getShader(this.shaderKey);
    if (shader) { shader.use(); shader.setUniform('u_opacity', { type: 'float', value: opacity }); }
  }

  // ── RenderLayer ──

  render(engine: RenderEngine, state: RenderState): void {
    if (this.pointCount === 0) return;

    const gl     = engine.gl;
    const shader = engine.getShader(this.shaderKey);
    if (!shader) return;

    shader.use();
    shader.setUniform('u_matrix', {
      type:  'mat4',
      value: cameraMatrix(state.viewport, state.camera),
    });

    const xBuf = engine.buffers.get('cells_x');
    if (!xBuf) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, xBuf);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 1, gl.FLOAT, false, 0, 0);

    const yBuf = engine.buffers.get('cells_y');
    if (!yBuf) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, yBuf);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 0, 0);

    const colorBuf = engine.buffers.get('cells_coloridx');
    if (colorBuf) {
      gl.bindBuffer(gl.ARRAY_BUFFER, colorBuf);
      gl.enableVertexAttribArray(2);
      // Stored as UNSIGNED_SHORT but read as float in shader (no normalization)
      gl.vertexAttribPointer(2, 1, gl.UNSIGNED_SHORT, false, 0, 0);
    }

    // Bind palette texture
    if (this.paletteTex) {
      gl.activeTexture(gl.TEXTURE0 + this.paletteUnit);
      gl.bindTexture(gl.TEXTURE_2D, this.paletteTex);
      shader.setUniform('u_palette', { type: 'sampler2D', value: this.paletteUnit });
    }

    gl.drawArrays(gl.POINTS, 0, this.pointCount);

    gl.disableVertexAttribArray(0);
    gl.disableVertexAttribArray(1);
    gl.disableVertexAttribArray(2);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
  }

  dispose(): void {
    // palette texture is managed directly; caller must pass gl to clean up
    this.pointCount  = 0;
    this.paletteTex  = null;
  }
}
