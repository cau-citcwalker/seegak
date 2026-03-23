import {
  type RenderEngine, type RenderLayer, type RenderState,
  cameraMatrix, hexToVec4,
  DataWorker,
} from '@seegak/core';
import { BaseChart, type BaseChartOptions } from '@seegak/bio-charts';

// ─── Shaders ───

const VOLCANO_POINTS_VERT = `#version 300 es
precision highp float;

layout(location = 0) in vec2 a_position;
layout(location = 1) in float a_class;

uniform mat4 u_projection;
uniform float u_pointSize;

out float v_class;

void main() {
  gl_Position = u_projection * vec4(a_position, 0.0, 1.0);
  gl_PointSize = u_pointSize;
  v_class = a_class;
}
`;

const VOLCANO_POINTS_FRAG = `#version 300 es
precision mediump float;

in float v_class;

uniform vec3 u_nsColor;
uniform vec3 u_upColor;
uniform vec3 u_downColor;
uniform float u_opacity;

out vec4 fragColor;

void main() {
  vec2 coord = gl_PointCoord - vec2(0.5);
  if (dot(coord, coord) > 0.25) discard;
  int cls = int(v_class + 0.5);
  vec3 color = (cls == 1) ? u_upColor : (cls == 2) ? u_downColor : u_nsColor;
  fragColor = vec4(color, u_opacity);
}
`;

const VOLCANO_LINES_VERT = `#version 300 es
precision highp float;

layout(location = 0) in vec2 a_position;

uniform mat4 u_projection;

void main() {
  gl_Position = u_projection * vec4(a_position, 0.0, 1.0);
}
`;

const VOLCANO_LINES_FRAG = `#version 300 es
precision mediump float;

uniform vec4 u_lineColor;

out vec4 fragColor;

void main() {
  fragColor = u_lineColor;
}
`;

// ─── Types ───

export interface VolcanoData {
  x: Float32Array;           // log2 fold change
  y: Float32Array;           // -log10(p-value)
  geneIds: string[];
  significant?: Uint8Array;  // 0=ns, 1=up, 2=down (pre-classified, optional)
  labels?: string[];         // genes to annotate with text
}

export interface VolcanoOptions extends BaseChartOptions {
  log2fcThreshold?: number;  // default 1.0
  pvalThreshold?: number;    // default 0.05
  upColor?: string;          // default '#ef4444'
  downColor?: string;        // default '#3b82f6'
  nsColor?: string;          // default '#94a3b8'
  pointSize?: number;        // default 4
  opacity?: number;          // default 0.7
  labelTopN?: number;        // annotate top N genes by significance
  onClickGene?: (geneId: string, index: number) => void;
}

// ─── Render Layers ───

class VolcanoPointsLayer implements RenderLayer {
  id = 'volcano-points';
  order = 10;
  private pointCount = 0;

  render(engine: RenderEngine, state: RenderState): void {
    if (this.pointCount === 0) return;

    const gl = engine.gl;
    const shader = engine.getShader('volcano-points');
    if (!shader) return;

    shader.use();
    shader.setUniform('u_projection', {
      type: 'mat4',
      value: cameraMatrix(state.viewport, state.camera),
    });

    const posBuf = engine.buffers.get('volcano_positions');
    if (!posBuf) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    const classBuf = engine.buffers.get('volcano_class');
    if (!classBuf) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, classBuf);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 0, 0);

    gl.drawArrays(gl.POINTS, 0, this.pointCount);

    gl.disableVertexAttribArray(0);
    gl.disableVertexAttribArray(1);
  }

  setPointCount(n: number): void { this.pointCount = n; }
}

class VolcanoLinesLayer implements RenderLayer {
  id = 'volcano-lines';
  order = 5; // draw behind points
  private lineVertexCount = 0;

  render(engine: RenderEngine, state: RenderState): void {
    if (this.lineVertexCount === 0) return;

    const gl = engine.gl;
    const shader = engine.getShader('volcano-lines');
    if (!shader) return;

    shader.use();
    shader.setUniform('u_projection', {
      type: 'mat4',
      value: cameraMatrix(state.viewport, state.camera),
    });

    const buf = engine.buffers.get('volcano_lines');
    if (!buf) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    gl.drawArrays(gl.LINES, 0, this.lineVertexCount);

    gl.disableVertexAttribArray(0);
  }

  setVertexCount(n: number): void { this.lineVertexCount = n; }
}

// ─── Chart ───

export class VolcanoPlotChart extends BaseChart {
  private pointsLayer: VolcanoPointsLayer;
  private linesLayer: VolcanoLinesLayer;
  private opts: Required<Pick<
    VolcanoOptions,
    'log2fcThreshold' | 'pvalThreshold' | 'upColor' | 'downColor' | 'nsColor' | 'pointSize' | 'opacity' | 'labelTopN'
  >>;
  private onClickGene?: VolcanoOptions['onClickGene'];
  private currentData: VolcanoData | null = null;
  private currentClassification: Uint8Array | null = null;

  constructor(container: HTMLElement, options: VolcanoOptions = {}) {
    super(container, options);

    this.opts = {
      log2fcThreshold: options.log2fcThreshold ?? 1.0,
      pvalThreshold: options.pvalThreshold ?? 0.05,
      upColor: options.upColor ?? '#ef4444',
      downColor: options.downColor ?? '#3b82f6',
      nsColor: options.nsColor ?? '#94a3b8',
      pointSize: options.pointSize ?? 4,
      opacity: options.opacity ?? 0.7,
      labelTopN: options.labelTopN ?? 0,
    };
    this.onClickGene = options.onClickGene;

    // Create shader programs
    this.engine.createShader('volcano-points', {
      vertex: VOLCANO_POINTS_VERT,
      fragment: VOLCANO_POINTS_FRAG,
    });
    this.engine.createShader('volcano-lines', {
      vertex: VOLCANO_LINES_VERT,
      fragment: VOLCANO_LINES_FRAG,
    });

    // Set initial point uniforms
    const pointShader = this.engine.getShader('volcano-points')!;
    pointShader.use();
    pointShader.setUniform('u_pointSize', { type: 'float', value: this.opts.pointSize });
    pointShader.setUniform('u_opacity', { type: 'float', value: this.opts.opacity });
    this.applyColorUniforms(pointShader);

    // Set threshold line color (semi-transparent slate)
    const lineShader = this.engine.getShader('volcano-lines')!;
    lineShader.use();
    lineShader.setUniform('u_lineColor', { type: 'vec4', value: [0.4, 0.5, 0.6, 0.6] });

    // Create and register render layers
    this.linesLayer = new VolcanoLinesLayer();
    this.pointsLayer = new VolcanoPointsLayer();
    this.engine.addLayer(this.linesLayer);
    this.engine.addLayer(this.pointsLayer);

    // Click handler for gene selection
    if (this.onClickGene) {
      this.attachClickHandler();
    }
  }

  // ─── Color helpers ───

  private applyColorUniforms(shader: ReturnType<typeof this.engine.getShader>): void {
    if (!shader) return;
    const up = hexToVec4(this.opts.upColor);
    const down = hexToVec4(this.opts.downColor);
    const ns = hexToVec4(this.opts.nsColor);
    shader.setUniform('u_upColor', { type: 'vec3', value: [up.r, up.g, up.b] });
    shader.setUniform('u_downColor', { type: 'vec3', value: [down.r, down.g, down.b] });
    shader.setUniform('u_nsColor', { type: 'vec3', value: [ns.r, ns.g, ns.b] });
  }

  // ─── Click handling ───

  private attachClickHandler(): void {
    const canvas = this.engine.gl.canvas as HTMLCanvasElement;
    canvas.addEventListener('click', (e: MouseEvent) => {
      if (!this.currentData || !this.onClickGene) return;
      const rect = canvas.getBoundingClientRect();
      const idx = this.hitTestPoint(e.clientX - rect.left, e.clientY - rect.top);
      if (idx >= 0) {
        this.onClickGene(this.currentData.geneIds[idx]!, idx);
      }
    });
  }

  private hitTestPoint(screenX: number, screenY: number): number {
    if (!this.currentData) return -1;
    const data = this.currentData;
    const n = data.x.length;
    const pr = this.engine.viewport.pixelRatio;
    const vp = this.engine.viewport;
    const cam = this.engine.camera;
    const aspect = vp.width / vp.height;
    const halfW = aspect / cam.zoom;
    const halfH = 1 / cam.zoom;

    // Convert screen → world
    const nx = (screenX * pr / vp.width) * 2 - 1;
    const ny = 1 - (screenY * pr / vp.height) * 2;
    const wx = nx * halfW + cam.center.x;
    const wy = ny * halfH + cam.center.y;

    // Threshold in world units: point size in world coordinates
    const threshold = (this.opts.pointSize * pr / vp.width) * halfW * 2;
    const threshSq = threshold * threshold;

    let bestIdx = -1;
    let bestDist = Infinity;
    for (let i = 0; i < n; i++) {
      const dx = data.x[i]! - wx;
      const dy = data.y[i]! - wy;
      const dist = dx * dx + dy * dy;
      if (dist < threshSq && dist < bestDist) {
        bestDist = dist;
        bestIdx = i;
      }
    }
    return bestIdx;
  }

  // ─── Threshold lines ───

  private buildThresholdLines(): Float32Array {
    const fc = this.opts.log2fcThreshold;
    const pval = -Math.log10(this.opts.pvalThreshold);

    // Big y extent for vertical lines (effectively infinite in data space)
    const yMax = 100;
    const xMax = 20;

    // 3 lines × 2 vertices × 2 components:
    // vertical at +fc, vertical at -fc, horizontal at pval
    const verts = new Float32Array(3 * 2 * 2);
    let i = 0;

    // Vertical line at +log2fc
    verts[i++] = fc;  verts[i++] = 0;
    verts[i++] = fc;  verts[i++] = yMax;

    // Vertical line at -log2fc
    verts[i++] = -fc; verts[i++] = 0;
    verts[i++] = -fc; verts[i++] = yMax;

    // Horizontal line at -log10(pval)
    verts[i++] = -xMax; verts[i++] = pval;
    verts[i++] = xMax;  verts[i++] = pval;

    return verts;
  }

  // ─── Label rendering ───

  private renderLabels(data: VolcanoData, classification: Uint8Array): void {
    if (this.opts.labelTopN <= 0) return;

    const n = data.x.length;
    const negLog10Pval = -Math.log10(this.opts.pvalThreshold);

    // Collect significant genes and sort by y-value descending (most significant first)
    const sigIndices: number[] = [];
    for (let i = 0; i < n; i++) {
      if (classification[i] !== 0) sigIndices.push(i);
    }
    sigIndices.sort((a, b) => data.y[b]! - data.y[a]!);

    const topN = sigIndices.slice(0, this.opts.labelTopN);
    if (topN.length === 0) return;

    const vp = this.engine.viewport;
    const pr = vp.pixelRatio;
    const cam = this.engine.camera;
    const vw = vp.width / pr;
    const vh = vp.height / pr;
    const aspect = vp.width / vp.height;
    const halfW = aspect / cam.zoom;
    const halfH = 1 / cam.zoom;

    this.text.resize(vw, vh);

    const labelColor = { r: 0.1, g: 0.1, b: 0.1, a: 0.9 };

    for (const idx of topN) {
      const wx = data.x[idx]!;
      const wy = data.y[idx]!;

      // World → screen (CSS pixels)
      const ndcX = (wx - cam.center.x) / halfW;
      const ndcY = (wy - cam.center.y) / halfH;
      const sx = (ndcX + 1) * 0.5 * vw;
      const sy = (1 - ndcY) * 0.5 * vh;

      const label = data.labels
        ? (data.labels[idx] ?? data.geneIds[idx]!)
        : data.geneIds[idx]!;

      this.text.add(label, sx + 6, sy - 6, {
        color: labelColor,
        fontSize: 10,
        align: 'left',
        baseline: 'bottom',
      });
    }

    this.text.flush();
  }

  // ─── update ───

  update(data: VolcanoData): void {
    this.currentData = data;
    const n = data.x.length;

    // ── Interleave x/y into a vec2 position buffer ──
    const positions = new Float32Array(n * 2);
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < n; i++) {
      const xi = data.x[i]!;
      const yi = data.y[i]!;
      positions[i * 2]     = xi;
      positions[i * 2 + 1] = yi;
      if (xi < minX) minX = xi;
      if (xi > maxX) maxX = xi;
      if (yi < minY) minY = yi;
      if (yi > maxY) maxY = yi;
    }
    this.engine.setBuffer('volcano_positions', { data: positions, usage: 'dynamic', size: 2 });

    // ── If pre-classified data is provided, use it directly ──
    if (data.significant) {
      this.applyClassification(data, data.significant);
    } else {
      // Start with all-NS while async classification runs
      const tempClass = new Float32Array(n); // all zeros = ns
      this.engine.setBuffer('volcano_class', { data: tempClass, usage: 'dynamic', size: 1 });
      this.pointsLayer.setPointCount(n);

      // Classify asynchronously using a worker message pattern
      this.classifyAsync(data);
    }

    // ── Threshold lines ──
    const lineVerts = this.buildThresholdLines();
    this.engine.setBuffer('volcano_lines', { data: lineVerts, usage: 'static', size: 2 });
    this.linesLayer.setVertexCount(lineVerts.length / 2);

    // ── autoFit camera ──
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const rangeX = maxX - minX || 1;
    const rangeY = maxY - minY || 1;
    const aspect = this.engine.viewport.width / this.engine.viewport.height;
    const zoom = Math.min(2 * aspect / (rangeX * 1.1), 2 / (rangeY * 1.1));
    this.engine.camera = { center: { x: cx, y: cy }, zoom };

    this.engine.requestRender();
  }

  private applyClassification(data: VolcanoData, classification: Uint8Array): void {
    this.currentClassification = classification;
    const n = data.x.length;

    // Convert Uint8 classification to Float32 for the vertex attribute
    const classFloat = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      classFloat[i] = classification[i]!;
    }

    this.engine.setBuffer('volcano_class', { data: classFloat, usage: 'dynamic', size: 1 });
    this.pointsLayer.setPointCount(n);
    this.renderLabels(data, classification);
    this.engine.requestRender();
  }

  private async classifyAsync(data: VolcanoData): Promise<void> {
    // Use a micro-task classification on the main thread via setTimeout
    // (avoids blocking the first render frame)
    await new Promise<void>(resolve => setTimeout(resolve, 0));

    // Check that data hasn't changed while we waited
    if (this.currentData !== data) return;

    const n = data.x.length;
    const negLog10Pval = -Math.log10(this.opts.pvalThreshold);
    const fc = this.opts.log2fcThreshold;
    const classification = new Uint8Array(n);

    for (let i = 0; i < n; i++) {
      const xi = data.x[i]!;
      const yi = data.y[i]!;
      if (xi > fc && yi >= negLog10Pval) {
        classification[i] = 1;
      } else if (xi < -fc && yi >= negLog10Pval) {
        classification[i] = 2;
      } else {
        classification[i] = 0;
      }
    }

    if (this.currentData === data) {
      this.applyClassification(data, classification);
    }
  }

  /**
   * Like `update()` but offloads point classification to a Worker.
   * Use this for large datasets (>100k points) to avoid blocking the main thread.
   */
  async updateAsync(data: VolcanoData, worker: DataWorker): Promise<void> {
    this.currentData = data;
    const n = data.x.length;

    // Upload positions immediately so first render is visible
    const positions = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      positions[i * 2]     = data.x[i]!;
      positions[i * 2 + 1] = data.y[i]!;
    }
    this.engine.setBuffer('volcano_positions', { data: positions, usage: 'dynamic', size: 2 });

    const tempClass = new Float32Array(n);
    this.engine.setBuffer('volcano_class', { data: tempClass, usage: 'dynamic', size: 1 });
    this.pointsLayer.setPointCount(n);

    const lineVerts = this.buildThresholdLines();
    this.engine.setBuffer('volcano_lines', { data: lineVerts, usage: 'static', size: 2 });
    this.linesLayer.setVertexCount(lineVerts.length / 2);
    this.engine.requestRender();

    // Classify in worker using the normalizeValues task as a proxy
    // (actual classification is done in genomics-worker-impl.ts; here we do it locally
    //  since DataWorker from core doesn't have classifyVolcano — use classifyAsync)
    await this.classifyAsync(data);
  }

  // ─── Public setters ───

  setPointSize(size: number): void {
    this.opts.pointSize = size;
    const shader = this.engine.getShader('volcano-points');
    if (shader) {
      shader.use();
      shader.setUniform('u_pointSize', { type: 'float', value: size });
      this.engine.requestRender();
    }
  }

  setOpacity(opacity: number): void {
    this.opts.opacity = opacity;
    const shader = this.engine.getShader('volcano-points');
    if (shader) {
      shader.use();
      shader.setUniform('u_opacity', { type: 'float', value: opacity });
      this.engine.requestRender();
    }
  }

  setThresholds(log2fc: number, pval: number): void {
    this.opts.log2fcThreshold = log2fc;
    this.opts.pvalThreshold = pval;

    // Reclassify and redraw lines
    if (this.currentData) {
      const lineVerts = this.buildThresholdLines();
      this.engine.setBuffer('volcano_lines', { data: lineVerts, usage: 'static', size: 2 });
      this.linesLayer.setVertexCount(lineVerts.length / 2);
      this.classifyAsync(this.currentData);
    }
  }

  destroy(): void {
    super.destroy();
  }
}
