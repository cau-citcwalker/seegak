import {
  type RenderEngine, type RenderLayer, type RenderState,
  cameraMatrix, hexToVec4,
} from '@seegak/core';
import { BaseChart, type BaseChartOptions } from '@seegak/bio-charts';

// ─── Shaders ───

const PROFILE_AREA_VERT = `#version 300 es
precision highp float;

layout(location = 0) in vec2 a_position;

uniform mat4 u_projection;

void main() {
  gl_Position = u_projection * vec4(a_position, 0.0, 1.0);
}
`;

const PROFILE_AREA_FRAG = `#version 300 es
precision mediump float;

uniform vec4 u_fillColor;

out vec4 fragColor;

void main() {
  fragColor = u_fillColor;
}
`;

const PROFILE_LINE_VERT = `#version 300 es
precision highp float;

layout(location = 0) in vec2 a_position;

uniform mat4 u_projection;

void main() {
  gl_Position = u_projection * vec4(a_position, 0.0, 1.0);
}
`;

const PROFILE_LINE_FRAG = `#version 300 es
precision mediump float;

uniform vec4 u_lineColor;

out vec4 fragColor;

void main() {
  fragColor = u_lineColor;
}
`;

const GENE_TRACK_VERT = `#version 300 es
precision highp float;

layout(location = 0) in vec2 a_position;
layout(location = 1) in vec4 a_color;

uniform mat4 u_projection;

out vec4 v_color;

void main() {
  gl_Position = u_projection * vec4(a_position, 0.0, 1.0);
  v_color = a_color;
}
`;

const GENE_TRACK_FRAG = `#version 300 es
precision mediump float;

in vec4 v_color;

out vec4 fragColor;

void main() {
  fragColor = v_color;
}
`;

// ─── Types ───

export interface GenomicTrack {
  label: string;
  regions: Array<{
    start: number;
    end: number;
    strand?: '+' | '-';
    color?: string;
  }>;
}

export interface GenomicProfileData {
  chrom: string;
  start: number;
  end: number;
  values: Float32Array;   // binned signal values
  binSize: number;
  tracks?: GenomicTrack[];
}

export interface GenomicProfileOptions extends BaseChartOptions {
  fillColor?: string;    // default '#3b82f680' (semi-transparent blue)
  lineColor?: string;    // default '#3b82f6'
  trackHeight?: number;  // px per track row, default 20
}

// ─── Render Layers ───

class ProfileAreaLayer implements RenderLayer {
  id = 'profile-area';
  order = 5;
  private vertexCount = 0;

  render(engine: RenderEngine, state: RenderState): void {
    if (this.vertexCount === 0) return;

    const gl = engine.gl;
    const shader = engine.getShader('profile-area');
    if (!shader) return;

    shader.use();
    shader.setUniform('u_projection', {
      type: 'mat4',
      value: cameraMatrix(state.viewport, state.camera),
    });

    const buf = engine.buffers.get('profile_area_verts');
    if (!buf) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, this.vertexCount);

    gl.disableVertexAttribArray(0);
  }

  setVertexCount(n: number): void { this.vertexCount = n; }
}

class ProfileLineLayer implements RenderLayer {
  id = 'profile-line';
  order = 10;
  private vertexCount = 0;

  render(engine: RenderEngine, state: RenderState): void {
    if (this.vertexCount === 0) return;

    const gl = engine.gl;
    const shader = engine.getShader('profile-line');
    if (!shader) return;

    shader.use();
    shader.setUniform('u_projection', {
      type: 'mat4',
      value: cameraMatrix(state.viewport, state.camera),
    });

    const buf = engine.buffers.get('profile_line_verts');
    if (!buf) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    gl.drawArrays(gl.LINE_STRIP, 0, this.vertexCount);

    gl.disableVertexAttribArray(0);
  }

  setVertexCount(n: number): void { this.vertexCount = n; }
}

class GeneTrackLayer implements RenderLayer {
  id = 'gene-tracks';
  order = 15;
  private vertexCount = 0;

  render(engine: RenderEngine, state: RenderState): void {
    if (this.vertexCount === 0) return;

    const gl = engine.gl;
    const shader = engine.getShader('gene-tracks');
    if (!shader) return;

    shader.use();
    shader.setUniform('u_projection', {
      type: 'mat4',
      value: cameraMatrix(state.viewport, state.camera),
    });

    const posBuf = engine.buffers.get('gene_track_positions');
    if (!posBuf) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    const colorBuf = engine.buffers.get('gene_track_colors');
    if (!colorBuf) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, colorBuf);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 0, 0);

    gl.drawArrays(gl.TRIANGLES, 0, this.vertexCount);

    gl.disableVertexAttribArray(0);
    gl.disableVertexAttribArray(1);
  }

  setVertexCount(n: number): void { this.vertexCount = n; }
}

// ─── Arrow geometry helper ───

/**
 * Build a gene body rectangle (or arrow) as 2 triangles (6 vertices).
 * Returns position and color interleaved data for each vertex.
 * Strand direction is indicated by a pointed end.
 */
function buildGeneRect(
  x0: number, x1: number,
  y0: number, y1: number,
  strand: '+' | '-' | undefined,
  color: readonly [number, number, number, number],
  positions: number[],
  colors: number[],
): void {
  const arrowSize = Math.min((x1 - x0) * 0.2, (y1 - y0) * 0.5);
  const yMid = (y0 + y1) / 2;

  let ax0 = x0, ax1 = x1;
  let pointX: number;
  let pointY = yMid;

  // Arrow tip replaces one corner depending on strand
  if (strand === '+') {
    pointX = x1 + arrowSize;
    ax1 = x1;
  } else if (strand === '-') {
    pointX = x0 - arrowSize;
    ax0 = x0;
  } else {
    // No strand direction: plain rectangle
    pushQuad(ax0, ax1, y0, y1, color, positions, colors);
    return;
  }

  // Build arrow: rectangle body + triangle tip
  // Rectangle body (2 triangles = 6 verts)
  pushQuad(ax0, ax1, y0, y1, color, positions, colors);

  // Arrow triangle
  if (strand === '+') {
    // Triangle: (ax1, y0), (ax1, y1), (pointX, yMid)
    pushTriangle(
      ax1, y0,
      ax1, y1,
      pointX, pointY,
      color, positions, colors,
    );
  } else {
    // Triangle: (ax0, y0), (ax0, y1), (pointX, yMid)
    pushTriangle(
      ax0, y0,
      ax0, y1,
      pointX, pointY,
      color, positions, colors,
    );
  }
}

function pushQuad(
  x0: number, x1: number,
  y0: number, y1: number,
  color: readonly [number, number, number, number],
  positions: number[],
  colors: number[],
): void {
  // Two triangles: (x0,y0)→(x1,y0)→(x1,y1), (x0,y0)→(x1,y1)→(x0,y1)
  const verts = [
    x0, y0, x1, y0, x1, y1,
    x0, y0, x1, y1, x0, y1,
  ];
  for (let i = 0; i < 6; i++) {
    positions.push(verts[i * 2]!, verts[i * 2 + 1]!);
    colors.push(color[0], color[1], color[2], color[3]);
  }
}

function pushTriangle(
  x0: number, y0: number,
  x1: number, y1: number,
  x2: number, y2: number,
  color: readonly [number, number, number, number],
  positions: number[],
  colors: number[],
): void {
  positions.push(x0, y0, x1, y1, x2, y2);
  for (let i = 0; i < 3; i++) {
    colors.push(color[0], color[1], color[2], color[3]);
  }
}

// ─── Chart ───

export class GenomicProfileChart extends BaseChart {
  private areaLayer: ProfileAreaLayer;
  private lineLayer: ProfileLineLayer;
  private trackLayer: GeneTrackLayer;
  private opts: Required<Pick<GenomicProfileOptions, 'fillColor' | 'lineColor' | 'trackHeight'>>;
  private currentData: GenomicProfileData | null = null;

  constructor(container: HTMLElement, options: GenomicProfileOptions = {}) {
    super(container, options);

    this.opts = {
      fillColor: options.fillColor ?? '#3b82f680',
      lineColor: options.lineColor ?? '#3b82f6',
      trackHeight: options.trackHeight ?? 20,
    };

    // Create shader programs
    this.engine.createShader('profile-area', {
      vertex: PROFILE_AREA_VERT,
      fragment: PROFILE_AREA_FRAG,
    });
    this.engine.createShader('profile-line', {
      vertex: PROFILE_LINE_VERT,
      fragment: PROFILE_LINE_FRAG,
    });
    this.engine.createShader('gene-tracks', {
      vertex: GENE_TRACK_VERT,
      fragment: GENE_TRACK_FRAG,
    });

    // Set initial color uniforms
    const fillVec4 = hexToVec4(this.opts.fillColor);
    const areaShader = this.engine.getShader('profile-area')!;
    areaShader.use();
    areaShader.setUniform('u_fillColor', {
      type: 'vec4',
      value: [fillVec4.r, fillVec4.g, fillVec4.b, fillVec4.a * 0.4],
    });

    const lineVec4 = hexToVec4(this.opts.lineColor);
    const lineShader = this.engine.getShader('profile-line')!;
    lineShader.use();
    lineShader.setUniform('u_lineColor', {
      type: 'vec4',
      value: [lineVec4.r, lineVec4.g, lineVec4.b, 1.0],
    });

    // Register layers
    this.areaLayer = new ProfileAreaLayer();
    this.lineLayer = new ProfileLineLayer();
    this.trackLayer = new GeneTrackLayer();
    this.engine.addLayer(this.areaLayer);
    this.engine.addLayer(this.lineLayer);
    this.engine.addLayer(this.trackLayer);
  }

  // ─── Data update ───

  update(data: GenomicProfileData): void {
    this.currentData = data;
    const binCount = data.values.length;
    const regionLen = data.end - data.start;

    // ── Build TRIANGLE_STRIP for filled area ──
    // For each bin we add 2 vertices: (x, 0) bottom and (x, value) top
    // This creates a filled area under the curve
    const areaVerts = new Float32Array(binCount * 2 * 2);
    const lineVerts = new Float32Array(binCount * 2);

    let maxVal = 0;
    for (let i = 0; i < binCount; i++) {
      if (data.values[i]! > maxVal) maxVal = data.values[i]!;
    }
    maxVal = maxVal || 1;

    for (let i = 0; i < binCount; i++) {
      const normX = (i + 0.5) / binCount; // center of bin in [0,1] space
      const normY = data.values[i]! / maxVal;

      // Area TRIANGLE_STRIP: alternate bottom and top
      areaVerts[i * 4]     = normX;
      areaVerts[i * 4 + 1] = 0;
      areaVerts[i * 4 + 2] = normX;
      areaVerts[i * 4 + 3] = normY;

      // Line strip
      lineVerts[i * 2]     = normX;
      lineVerts[i * 2 + 1] = normY;
    }

    this.engine.setBuffer('profile_area_verts', { data: areaVerts, usage: 'dynamic', size: 2 });
    // Each bin contributes 2 vertices (bottom + top) to the strip
    this.areaLayer.setVertexCount(binCount * 2);

    this.engine.setBuffer('profile_line_verts', { data: lineVerts, usage: 'dynamic', size: 2 });
    this.lineLayer.setVertexCount(binCount);

    // ── Gene tracks ──
    if (data.tracks && data.tracks.length > 0) {
      this.buildGeneTracks(data);
    } else {
      this.trackLayer.setVertexCount(0);
    }

    // ── Fit camera to show [0,1] × [0,1] ──
    const aspect = this.engine.viewport.width / this.engine.viewport.height;
    const zoom = Math.min(2 * aspect / 1.1, 2 / 1.2);
    this.engine.camera = { center: { x: 0.5, y: 0.5 }, zoom };

    // ── Axis label for chromosome position ──
    const vp = this.engine.viewport;
    const pr = vp.pixelRatio;
    const vw = vp.width / pr;
    const vh = vp.height / pr;
    this.text.resize(vw, vh);
    const area = this.plotArea;
    this.text.add(
      `${data.chrom}:${data.start.toLocaleString()}–${data.end.toLocaleString()}`,
      area.x + area.width / 2,
      area.y + area.height + 8,
      { color: { r: 0.6, g: 0.7, b: 0.8, a: 1 }, fontSize: 11, align: 'center', baseline: 'top' },
    );
    this.text.flush();

    this.engine.requestRender();
  }

  private buildGeneTracks(data: GenomicProfileData): void {
    if (!data.tracks || data.tracks.length === 0) return;

    const regionLen = data.end - data.start;
    if (regionLen <= 0) return;

    const positions: number[] = [];
    const colors: number[] = [];

    // Default track colors palette
    const defaultColors = [
      '#10b981', '#f59e0b', '#8b5cf6', '#06b6d4',
      '#ec4899', '#84cc16', '#f97316', '#6366f1',
    ];

    // Tracks are stacked below the signal profile in y-space.
    // We lay them out in a sub-region of [0,1] y-space below zero.
    const trackSpacing = -0.15; // step per track row (negative = downward)

    for (let trackIdx = 0; trackIdx < data.tracks.length; trackIdx++) {
      const track = data.tracks[trackIdx]!;
      const trackY = trackSpacing * (trackIdx + 1);
      const halfH = 0.04; // half-height of each gene bar
      const y0 = trackY - halfH;
      const y1 = trackY + halfH;

      for (const region of track.regions) {
        if (region.end < data.start || region.start > data.end) continue;

        const normX0 = Math.max(0, (region.start - data.start) / regionLen);
        const normX1 = Math.min(1, (region.end - data.start) / regionLen);
        if (normX1 <= normX0) continue;

        const hexColor = region.color
          ?? defaultColors[trackIdx % defaultColors.length]!;
        const c = hexToVec4(hexColor);
        const colorTuple: [number, number, number, number] = [c.r, c.g, c.b, c.a];

        buildGeneRect(normX0, normX1, y0, y1, region.strand, colorTuple, positions, colors);
      }
    }

    if (positions.length === 0) {
      this.trackLayer.setVertexCount(0);
      return;
    }

    const positionData = new Float32Array(positions);
    const colorData = new Float32Array(colors);
    this.engine.setBuffer('gene_track_positions', { data: positionData, usage: 'dynamic', size: 2 });
    this.engine.setBuffer('gene_track_colors', { data: colorData, usage: 'dynamic', size: 4 });
    this.trackLayer.setVertexCount(positionData.length / 2);

    // Render track labels via TextRenderer
    const vp = this.engine.viewport;
    const pr = vp.pixelRatio;
    const cam = this.engine.camera;
    const vw = vp.width / pr;
    const vh = vp.height / pr;
    const aspect = vp.width / vp.height;
    const halfW = aspect / cam.zoom;
    const halfH = 1 / cam.zoom;

    const trackSpacingStep = -0.15;
    for (let trackIdx = 0; trackIdx < data.tracks.length; trackIdx++) {
      const track = data.tracks[trackIdx]!;
      const trackY = trackSpacingStep * (trackIdx + 1);

      // World → screen (CSS pixels)
      const ndcX = (0 - cam.center.x) / halfW;
      const ndcY = (trackY - cam.center.y) / halfH;
      const sx = Math.max(this.margin.left, (ndcX + 1) * 0.5 * vw);
      const sy = (1 - ndcY) * 0.5 * vh;

      this.text.add(track.label, sx, sy, {
        color: { r: 0.7, g: 0.8, b: 0.9, a: 1 },
        fontSize: 10,
        align: 'right',
        baseline: 'middle',
      });
    }
  }

  // ─── Public setters ───

  setFillColor(color: string): void {
    this.opts.fillColor = color;
    const c = hexToVec4(color);
    const shader = this.engine.getShader('profile-area');
    if (shader) {
      shader.use();
      shader.setUniform('u_fillColor', { type: 'vec4', value: [c.r, c.g, c.b, c.a * 0.4] });
      this.engine.requestRender();
    }
  }

  setLineColor(color: string): void {
    this.opts.lineColor = color;
    const c = hexToVec4(color);
    const shader = this.engine.getShader('profile-line');
    if (shader) {
      shader.use();
      shader.setUniform('u_lineColor', { type: 'vec4', value: [c.r, c.g, c.b, 1.0] });
      this.engine.requestRender();
    }
  }

  destroy(): void {
    super.destroy();
  }
}
