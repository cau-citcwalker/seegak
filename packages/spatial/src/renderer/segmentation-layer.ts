import type { RenderLayer, RenderEngine, RenderState } from '@seegak/core';
import { cameraMatrix, hexToVec4 } from '@seegak/core';

// ─── Shaders ───

/**
 * Segmentation vertex shader.
 * Renders pre-triangulated cell outline meshes in physical coordinate space.
 *   location 0 — a_pos: vec2 vertex in physical coords
 */
const SEG_VERT = `#version 300 es
precision highp float;

layout(location = 0) in vec2 a_pos;

uniform mat4 u_matrix;

void main() {
  gl_Position = u_matrix * vec4(a_pos, 0.0, 1.0);
}
`;

/**
 * Segmentation fragment shader.
 * Fills all fragments with a uniform color + alpha.
 */
const SEG_FRAG = `#version 300 es
precision highp float;

uniform vec4 u_color;

out vec4 fragColor;

void main() {
  fragColor = u_color;
}
`;

// ─── Layer ───

/**
 * SegmentationLayer renders pre-triangulated cell polygon outlines.
 * Takes flat vertex + index data from SpatialSegmentation and renders
 * using gl.TRIANGLES with a uniform fill color and alpha.
 */
export class SegmentationLayer implements RenderLayer {
  id    = 'spatial-segmentation';
  order = 15;  // above image, below cells

  private indexCount = 0;
  private shaderKey  = 'spatial-segmentation';
  private color: [number, number, number, number] = [1, 1, 1, 0.3];

  // ── Init ──

  init(engine: RenderEngine): void {
    engine.createShader(this.shaderKey, { vertex: SEG_VERT, fragment: SEG_FRAG });

    const shader = engine.getShader(this.shaderKey)!;
    shader.use();
    shader.setUniform('u_color', {
      type:  'vec4',
      value: [...this.color],
    });
  }

  // ── Data upload ──

  /**
   * Upload pre-triangulated segmentation geometry.
   *
   * @param vertices    Float32Array of flat x,y pairs (in physical coords)
   * @param indices     Uint32Array of triangle vertex indices into `vertices`
   * @param engine      RenderEngine (for buffer management)
   */
  setData(
    engine: RenderEngine,
    vertices: Float32Array,
    indices: Uint32Array,
  ): void {
    const gl = engine.gl;

    // Upload vertex buffer (Float32Array of flat x,y pairs)
    engine.setBuffer('seg_vertices', {
      data:  vertices,
      usage: 'static',
      size:  2,
    });

    // Element array buffer is managed directly (BufferManager only handles ARRAY_BUFFER)
    let idxBuf = this._indexBuffer;
    if (!idxBuf) {
      idxBuf = gl.createBuffer()!;
      this._indexBuffer = idxBuf;
    }
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxBuf);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);

    this.indexCount = indices.length;
  }

  private _indexBuffer: WebGLBuffer | null = null;

  /** Set fill color and opacity. Accepts a hex string or RGBA tuple. */
  setColor(engine: RenderEngine, hex: string, alpha = 0.3): void {
    const c = hexToVec4(hex);
    this.color = [c.r, c.g, c.b, alpha];
    const shader = engine.getShader(this.shaderKey);
    if (shader) {
      shader.use();
      shader.setUniform('u_color', { type: 'vec4', value: [...this.color] });
    }
  }

  // ── RenderLayer ──

  render(engine: RenderEngine, state: RenderState): void {
    if (this.indexCount === 0 || !this._indexBuffer) return;

    const gl     = engine.gl;
    const shader = engine.getShader(this.shaderKey);
    if (!shader) return;

    shader.use();
    shader.setUniform('u_matrix', {
      type:  'mat4',
      value: cameraMatrix(state.viewport, state.camera),
    });
    shader.setUniform('u_color', {
      type:  'vec4',
      value: [...this.color],
    });

    const vBuf = engine.buffers.get('seg_vertices');
    if (!vBuf) return;

    gl.bindBuffer(gl.ARRAY_BUFFER, vBuf);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this._indexBuffer);
    gl.drawElements(gl.TRIANGLES, this.indexCount, gl.UNSIGNED_INT, 0);

    gl.disableVertexAttribArray(0);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
  }

  dispose(): void {
    this.indexCount  = 0;
    this._indexBuffer = null;
  }
}
