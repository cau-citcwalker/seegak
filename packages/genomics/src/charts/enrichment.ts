import {
  type RenderEngine, type RenderLayer, type RenderState,
  cameraMatrix, hexToVec4,
} from '@seegak/core';
import { BaseChart, type BaseChartOptions } from '@seegak/bio-charts';

// ─── Shaders ───

const ENRICHMENT_SCORE_VERT = `#version 300 es
precision highp float;

layout(location = 0) in vec2 a_position;

uniform mat4 u_projection;

void main() {
  gl_Position = u_projection * vec4(a_position, 0.0, 1.0);
}
`;

const ENRICHMENT_SCORE_FRAG = `#version 300 es
precision mediump float;

uniform vec4 u_color;

out vec4 fragColor;

void main() {
  fragColor = u_color;
}
`;

const ENRICHMENT_HIT_VERT = `#version 300 es
precision highp float;

layout(location = 0) in vec2 a_position;

uniform mat4 u_projection;

void main() {
  gl_Position = u_projection * vec4(a_position, 0.0, 1.0);
}
`;

const ENRICHMENT_HIT_FRAG = `#version 300 es
precision mediump float;

uniform vec4 u_hitColor;

out vec4 fragColor;

void main() {
  fragColor = u_hitColor;
}
`;

// ─── Types ───

export interface EnrichmentData {
  runningScore: Float32Array;  // one value per rank
  hitPositions: Uint32Array;   // gene positions in ranked list
  totalGenes: number;
  geneSetName: string;
  es: number;
  nes: number;
  pval: number;
  fdr: number;
}

export interface EnrichmentOptions extends BaseChartOptions {
  scoreColor?: string;   // default '#3b82f6'
  hitColor?: string;     // default '#ef4444'
  showStats?: boolean;   // show ES/NES/pval text overlay, default true
}

// ─── Render Layers ───

class RunningScoreLayer implements RenderLayer {
  id = 'enrichment-score';
  order = 10;
  private vertexCount = 0;

  render(engine: RenderEngine, state: RenderState): void {
    if (this.vertexCount === 0) return;

    const gl = engine.gl;
    const shader = engine.getShader('enrichment-score');
    if (!shader) return;

    shader.use();
    shader.setUniform('u_projection', {
      type: 'mat4',
      value: cameraMatrix(state.viewport, state.camera),
    });

    const buf = engine.buffers.get('enrichment_score_positions');
    if (!buf) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    gl.drawArrays(gl.LINE_STRIP, 0, this.vertexCount);

    gl.disableVertexAttribArray(0);
  }

  setVertexCount(n: number): void { this.vertexCount = n; }
}

class HitLayer implements RenderLayer {
  id = 'enrichment-hits';
  order = 5; // draw behind score line
  private vertexCount = 0;

  render(engine: RenderEngine, state: RenderState): void {
    if (this.vertexCount === 0) return;

    const gl = engine.gl;
    const shader = engine.getShader('enrichment-hits');
    if (!shader) return;

    shader.use();
    shader.setUniform('u_projection', {
      type: 'mat4',
      value: cameraMatrix(state.viewport, state.camera),
    });

    const buf = engine.buffers.get('enrichment_hit_positions');
    if (!buf) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    gl.drawArrays(gl.LINES, 0, this.vertexCount);

    gl.disableVertexAttribArray(0);
  }

  setVertexCount(n: number): void { this.vertexCount = n; }
}

// ─── Chart ───

export class EnrichmentPlotChart extends BaseChart {
  private scoreLayer: RunningScoreLayer;
  private hitLayer: HitLayer;
  private opts: Required<Pick<EnrichmentOptions, 'scoreColor' | 'hitColor' | 'showStats'>>;
  private currentData: EnrichmentData | null = null;

  constructor(container: HTMLElement, options: EnrichmentOptions = {}) {
    super(container, options);

    this.opts = {
      scoreColor: options.scoreColor ?? '#3b82f6',
      hitColor: options.hitColor ?? '#ef4444',
      showStats: options.showStats ?? true,
    };

    // Create shader programs
    this.engine.createShader('enrichment-score', {
      vertex: ENRICHMENT_SCORE_VERT,
      fragment: ENRICHMENT_SCORE_FRAG,
    });
    this.engine.createShader('enrichment-hits', {
      vertex: ENRICHMENT_HIT_VERT,
      fragment: ENRICHMENT_HIT_FRAG,
    });

    // Set initial color uniforms
    const scoreVec4 = hexToVec4(this.opts.scoreColor);
    const scoreShader = this.engine.getShader('enrichment-score')!;
    scoreShader.use();
    scoreShader.setUniform('u_color', {
      type: 'vec4',
      value: [scoreVec4.r, scoreVec4.g, scoreVec4.b, 1.0],
    });

    const hitVec4 = hexToVec4(this.opts.hitColor);
    const hitShader = this.engine.getShader('enrichment-hits')!;
    hitShader.use();
    hitShader.setUniform('u_hitColor', {
      type: 'vec4',
      value: [hitVec4.r, hitVec4.g, hitVec4.b, 0.8],
    });

    // Register layers
    this.hitLayer = new HitLayer();
    this.scoreLayer = new RunningScoreLayer();
    this.engine.addLayer(this.hitLayer);
    this.engine.addLayer(this.scoreLayer);
  }

  // ─── Data update ───

  update(data: EnrichmentData): void {
    this.currentData = data;
    const total = data.totalGenes;
    const scoreLen = data.runningScore.length;

    // ── Running score line: one vertex per rank at (rank/total, score) ──
    const scorePositions = new Float32Array(scoreLen * 2);
    let minScore = Infinity, maxScore = -Infinity;
    for (let i = 0; i < scoreLen; i++) {
      const s = data.runningScore[i]!;
      scorePositions[i * 2]     = i / Math.max(1, total - 1);
      scorePositions[i * 2 + 1] = s;
      if (s < minScore) minScore = s;
      if (s > maxScore) maxScore = s;
    }
    this.engine.setBuffer('enrichment_score_positions', {
      data: scorePositions,
      usage: 'dynamic',
      size: 2,
    });
    this.scoreLayer.setVertexCount(scoreLen);

    // ── Hit positions: vertical ticks at each hit gene position ──
    // Each hit = 2 vertices (bottom and top of tick mark in score space)
    const hitCount = data.hitPositions.length;
    const tickHeight = (maxScore - minScore) * 0.05; // 5% of score range
    const tickBottom = minScore - tickHeight;
    const tickTop = minScore;

    const hitPositions = new Float32Array(hitCount * 2 * 2); // 2 verts × 2 floats each
    for (let i = 0; i < hitCount; i++) {
      const normPos = data.hitPositions[i]! / Math.max(1, total - 1);
      hitPositions[i * 4]     = normPos;
      hitPositions[i * 4 + 1] = tickBottom;
      hitPositions[i * 4 + 2] = normPos;
      hitPositions[i * 4 + 3] = tickTop;
    }
    this.engine.setBuffer('enrichment_hit_positions', {
      data: hitPositions,
      usage: 'dynamic',
      size: 2,
    });
    this.hitLayer.setVertexCount(hitCount * 2);

    // ── Fit camera to show full [0,1] × [minScore, maxScore] range ──
    const scoreRange = maxScore - minScore || 1;
    const cy = (minScore + maxScore) / 2;
    const aspect = this.engine.viewport.width / this.engine.viewport.height;
    const zoom = Math.min(
      2 * aspect / (1.1),           // x: [0, 1] with padding
      2 / (scoreRange * 1.2),       // y range with padding
    );
    this.engine.camera = { center: { x: 0.5, y: cy }, zoom };

    // ── Stats text overlay ──
    if (this.opts.showStats) {
      this.renderStatsOverlay(data);
    }

    this.engine.requestRender();
  }

  private renderStatsOverlay(data: EnrichmentData): void {
    const vp = this.engine.viewport;
    const pr = vp.pixelRatio;
    const vw = vp.width / pr;
    const vh = vp.height / pr;
    this.text.resize(vw, vh);

    const textColor = { r: 0.9, g: 0.9, b: 0.9, a: 1.0 };
    const area = this.plotArea;
    const x = area.x + 8;
    let y = area.y + 8;
    const lineHeight = 14;

    this.text.add(data.geneSetName, x, y, {
      color: { r: 1, g: 1, b: 1, a: 1 },
      fontSize: 11,
      align: 'left',
      baseline: 'top',
    });
    y += lineHeight;

    this.text.add(`ES: ${data.es.toFixed(3)}`, x, y, {
      color: textColor, fontSize: 10, align: 'left', baseline: 'top',
    });
    y += lineHeight;

    this.text.add(`NES: ${data.nes.toFixed(3)}`, x, y, {
      color: textColor, fontSize: 10, align: 'left', baseline: 'top',
    });
    y += lineHeight;

    this.text.add(`p-val: ${data.pval.toExponential(2)}`, x, y, {
      color: textColor, fontSize: 10, align: 'left', baseline: 'top',
    });
    y += lineHeight;

    this.text.add(`FDR: ${data.fdr.toExponential(2)}`, x, y, {
      color: textColor, fontSize: 10, align: 'left', baseline: 'top',
    });

    this.text.flush();
  }

  // ─── Public setters ───

  setScoreColor(color: string): void {
    this.opts.scoreColor = color;
    const c = hexToVec4(color);
    const shader = this.engine.getShader('enrichment-score');
    if (shader) {
      shader.use();
      shader.setUniform('u_color', { type: 'vec4', value: [c.r, c.g, c.b, 1.0] });
      this.engine.requestRender();
    }
  }

  setHitColor(color: string): void {
    this.opts.hitColor = color;
    const c = hexToVec4(color);
    const shader = this.engine.getShader('enrichment-hits');
    if (shader) {
      shader.use();
      shader.setUniform('u_hitColor', { type: 'vec4', value: [c.r, c.g, c.b, 0.8] });
      this.engine.requestRender();
    }
  }

  destroy(): void {
    super.destroy();
  }
}
