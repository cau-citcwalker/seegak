import type { RenderLayer, RenderEngine, RenderState } from '@seegak/core';
import { cameraMatrix, hexToVec4 } from '@seegak/core';

// ─── Shaders ───

/**
 * Molecule vertex shader.
 * One point per transcript molecule; color is looked up from a 256-entry
 * gene palette texture (one color per gene, up to 256 genes).
 *   location 0 — a_x:       float, physical x
 *   location 1 — a_y:       float, physical y
 *   location 2 — a_geneIdx: float (from UNSIGNED_BYTE), gene index 0-255
 */
const MOL_VERT = `#version 300 es
precision highp float;

layout(location = 0) in float a_x;
layout(location = 1) in float a_y;
layout(location = 2) in float a_geneIdx;

uniform mat4 u_matrix;
uniform float u_pointSize;

out float v_geneIdx;

void main() {
  gl_Position = u_matrix * vec4(a_x, a_y, 0.0, 1.0);
  gl_PointSize = u_pointSize;
  v_geneIdx = a_geneIdx;
}
`;

/**
 * Molecule fragment shader.
 * Looks up gene color from the palette texture (NEAREST sampling).
 * Renders hard circular points for small dot sizes.
 */
const MOL_FRAG = `#version 300 es
precision highp float;

in float v_geneIdx;

uniform sampler2D u_genePalette;
uniform float u_opacity;

out vec4 fragColor;

void main() {
  vec2 cxy = 2.0 * gl_PointCoord - 1.0;
  float r = dot(cxy, cxy);
  if (r > 1.0) discard;

  vec4 color = texture(u_genePalette, vec2((v_geneIdx + 0.5) / 256.0, 0.5));
  fragColor = vec4(color.rgb, color.a * u_opacity);
}
`;

// ─── Default gene palette (up to 256 genes) ───

const GENE_PALETTE_BASE = [
  '#e6194b', '#3cb44b', '#ffe119', '#4363d8', '#f58231',
  '#911eb4', '#42d4f4', '#f032e6', '#bfef45', '#fabebe',
  '#469990', '#dcbeff', '#9a6324', '#fffac8', '#800000',
  '#aaffc3', '#808000', '#ffd8b1', '#000075', '#a9a9a9',
  '#ffffff', '#000000',
];

// ─── Layer ───

/**
 * MoleculeLayer renders transcript molecule dots in physical coordinate space.
 * Up to 256 distinct genes can be shown simultaneously, each with its own color
 * stored in a gene palette texture.
 */
export class MoleculeLayer implements RenderLayer {
  id    = 'spatial-molecules';
  order = 25;  // on top of cells

  private pointCount  = 0;
  private shaderKey   = 'spatial-molecules';
  private paletteUnit = 9; // texture unit for gene palette

  private genePaletteTex: WebGLTexture | null = null;
  /** Maps geneId → palette slot (0-255) */
  private geneColorMap = new Map<string, number>();

  // ── Init ──

  init(engine: RenderEngine): void {
    engine.createShader(this.shaderKey, { vertex: MOL_VERT, fragment: MOL_FRAG });

    const gl = engine.gl;

    // Pre-allocate gene palette texture (256×1 RGBA32F, NEAREST)
    const paletteData = new Float32Array(256 * 4);
    // Fill with base colors
    for (let i = 0; i < GENE_PALETTE_BASE.length; i++) {
      const hex = GENE_PALETTE_BASE[i % GENE_PALETTE_BASE.length]!;
      const c   = hexToVec4(hex);
      paletteData[i * 4 + 0] = c.r;
      paletteData[i * 4 + 1] = c.g;
      paletteData[i * 4 + 2] = c.b;
      paletteData[i * 4 + 3] = c.a;
    }

    this.genePaletteTex = gl.createTexture()!;
    gl.activeTexture(gl.TEXTURE0 + this.paletteUnit);
    gl.bindTexture(gl.TEXTURE_2D, this.genePaletteTex);
    gl.texImage2D(
      gl.TEXTURE_2D, 0, gl.RGBA32F, 256, 1, 0,
      gl.RGBA, gl.FLOAT, paletteData,
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    const shader = engine.getShader(this.shaderKey)!;
    shader.use();
    shader.setUniform('u_pointSize', { type: 'float', value: 2 });
    shader.setUniform('u_opacity',   { type: 'float', value: 1.0 });
  }

  // ── Data upload ──

  /**
   * Upload molecule x/y positions and per-molecule gene index.
   *
   * @param x         Float32Array of physical x coordinates
   * @param y         Float32Array of physical y coordinates
   * @param geneIds   Parallel array of gene id strings (one per molecule)
   * @param engine    RenderEngine
   */
  setData(
    engine: RenderEngine,
    x: Float32Array,
    y: Float32Array,
    geneIds: string[],
  ): void {
    const n = x.length;

    engine.setBuffer('mol_x', { data: x, usage: 'dynamic', size: 1 });
    engine.setBuffer('mol_y', { data: y, usage: 'dynamic', size: 1 });

    // Build gene index per molecule
    this.geneColorMap.clear();
    const geneIdxBuf = new Uint8Array(n);
    let slotCount    = 0;

    for (let i = 0; i < n; i++) {
      const gene = geneIds[i]!;
      let slot = this.geneColorMap.get(gene);
      if (slot === undefined) {
        slot = slotCount++ & 0xff; // cap at 255
        this.geneColorMap.set(gene, slot);
      }
      geneIdxBuf[i] = slot;
    }

    engine.setBuffer('mol_geneidx', { data: geneIdxBuf, usage: 'dynamic', size: 1 });

    this.pointCount = n;
  }

  /**
   * Override gene colors with explicit per-gene hex map.
   * Keys are gene ids, values are hex color strings.
   */
  setGeneColors(
    gl: WebGL2RenderingContext,
    colorMap: Map<string, string>,
  ): void {
    if (!this.genePaletteTex) return;

    const paletteData = new Float32Array(256 * 4);

    for (const [gene, slot] of this.geneColorMap) {
      const hex = colorMap.get(gene) ??
        GENE_PALETTE_BASE[slot % GENE_PALETTE_BASE.length]!;
      const c = hexToVec4(hex);
      paletteData[slot * 4 + 0] = c.r;
      paletteData[slot * 4 + 1] = c.g;
      paletteData[slot * 4 + 2] = c.b;
      paletteData[slot * 4 + 3] = c.a;
    }

    gl.activeTexture(gl.TEXTURE0 + this.paletteUnit);
    gl.bindTexture(gl.TEXTURE_2D, this.genePaletteTex);
    gl.texSubImage2D(
      gl.TEXTURE_2D, 0, 0, 0, 256, 1,
      gl.RGBA, gl.FLOAT, paletteData,
    );
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

    const xBuf = engine.buffers.get('mol_x');
    if (!xBuf) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, xBuf);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 1, gl.FLOAT, false, 0, 0);

    const yBuf = engine.buffers.get('mol_y');
    if (!yBuf) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, yBuf);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 0, 0);

    const geneBuf = engine.buffers.get('mol_geneidx');
    if (geneBuf) {
      gl.bindBuffer(gl.ARRAY_BUFFER, geneBuf);
      gl.enableVertexAttribArray(2);
      gl.vertexAttribPointer(2, 1, gl.UNSIGNED_BYTE, false, 0, 0);
    }

    // Bind gene palette
    if (this.genePaletteTex) {
      gl.activeTexture(gl.TEXTURE0 + this.paletteUnit);
      gl.bindTexture(gl.TEXTURE_2D, this.genePaletteTex);
      shader.setUniform('u_genePalette', { type: 'sampler2D', value: this.paletteUnit });
    }

    gl.drawArrays(gl.POINTS, 0, this.pointCount);

    gl.disableVertexAttribArray(0);
    gl.disableVertexAttribArray(1);
    gl.disableVertexAttribArray(2);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
  }

  dispose(): void {
    this.pointCount     = 0;
    this.genePaletteTex = null;
    this.geneColorMap.clear();
  }
}
