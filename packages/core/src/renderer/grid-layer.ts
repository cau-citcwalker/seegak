import type { RenderLayer, RenderEngine } from './render-engine.js';
import type { RenderState } from '../types.js';
import { ShaderProgram } from './shader.js';
import { ortho } from '../utils/math.js';

// ─── Shaders ───

const GRID_VERT = /* glsl */ `#version 300 es
precision highp float;
layout(location = 0) in vec2 a_position;
uniform mat4 u_projection;
void main() {
  gl_Position = u_projection * vec4(a_position, 0.0, 1.0);
}
`;

const GRID_FRAG = /* glsl */ `#version 300 es
precision highp float;
uniform vec4 u_color;
out vec4 fragColor;
void main() {
  fragColor = u_color;
}
`;

/**
 * Compute a "nice" grid step for the given visible range.
 * Returns a round number (1, 2, 5, 10, 20, 50, ...) such that
 * roughly 4–8 grid lines fit in the range.
 */
function niceStep(range: number): number {
  const rough = range / 6;
  const pow = Math.pow(10, Math.floor(Math.log10(rough)));
  const frac = rough / pow;
  let nice: number;
  if (frac <= 1.5) nice = 1;
  else if (frac <= 3.5) nice = 2;
  else if (frac <= 7.5) nice = 5;
  else nice = 10;
  return nice * pow;
}

/**
 * WebGL grid layer that moves with the camera.
 * Dynamically computes grid spacing based on zoom level.
 */
export class GridLayer implements RenderLayer {
  readonly id = 'grid';
  readonly order = -10; // Draw behind everything

  private shader: ShaderProgram | null = null;
  private buffer: WebGLBuffer | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private vertexCount = 0;

  enabled = false;
  color: [number, number, number, number] = [1, 1, 1, 0.12];

  render(engine: RenderEngine, state: RenderState): void {
    if (!this.enabled) return;

    const gl = engine.gl;

    // Lazy init
    if (!this.shader) {
      this.shader = engine.createShader('_grid', { vertex: GRID_VERT, fragment: GRID_FRAG });
      this.vao = gl.createVertexArray()!;
      this.buffer = gl.createBuffer()!;
    }

    const cam = state.camera;
    const vp = state.viewport;
    const w = vp.width / vp.pixelRatio;
    const h = vp.height / vp.pixelRatio;

    // Visible world-space bounds
    const halfW = (w / 2) / cam.zoom;
    const halfH = (h / 2) / cam.zoom;
    const xMin = cam.center.x - halfW;
    const xMax = cam.center.x + halfW;
    const yMin = cam.center.y - halfH;
    const yMax = cam.center.y + halfH;

    const rangeX = xMax - xMin;
    const rangeY = yMax - yMin;
    const step = niceStep(Math.max(rangeX, rangeY));

    // Generate grid lines (in world coordinates)
    const vertices: number[] = [];

    const startX = Math.floor(xMin / step) * step;
    const startY = Math.floor(yMin / step) * step;

    // Vertical lines
    for (let x = startX; x <= xMax + step; x += step) {
      vertices.push(x, yMin, x, yMax);
    }
    // Horizontal lines
    for (let y = startY; y <= yMax + step; y += step) {
      vertices.push(xMin, y, xMax, y);
    }

    this.vertexCount = vertices.length / 2;
    if (this.vertexCount === 0) return;

    // Upload vertices
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    // Build projection from camera (world → clip)
    const proj = ortho(xMin, xMax, yMin, yMax, -1, 1);

    this.shader.use();
    this.shader.setUniform('u_projection', { type: 'mat4', value: proj });
    this.shader.setUniform('u_color', {
      type: 'vec4',
      value: { r: this.color[0], g: this.color[1], b: this.color[2], a: this.color[3] },
    });

    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.LINES, 0, this.vertexCount);
    gl.bindVertexArray(null);
  }

  /** Return the current grid step for scale bar rendering */
  getStep(engine: RenderEngine): number {
    const cam = engine.camera;
    const vp = engine.viewport;
    const w = vp.width / vp.pixelRatio;
    const h = vp.height / vp.pixelRatio;
    const halfW = (w / 2) / cam.zoom;
    const halfH = (h / 2) / cam.zoom;
    return niceStep(Math.max(halfW * 2, halfH * 2));
  }

  dispose(): void {
    // Cleanup handled by engine destroy
    this.shader = null;
    this.buffer = null;
    this.vao = null;
  }
}
