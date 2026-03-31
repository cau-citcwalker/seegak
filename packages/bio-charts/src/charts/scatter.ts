import {
  type RenderEngine, type RenderLayer, type RenderState,
  type ColorScale, type Vec2,
  cameraMatrix, hexToVec4, colorScaleToTexture,
  screenToWorld, worldToScreen,
  Tooltip, throttle,
  SpatialIndex,
  DataWorker,
  exportCSV,
  type SelectionEvent,
  type DownloadOption,
  VIRIDIS,
} from '@seegak/core';
import { BaseChart, type BaseChartOptions } from '../base-chart.js';
import { CellLegend, type CellLegendOptions, type ClusterEntry } from '../renderer/cell-legend.js';
import { HullOverlay, type HullData } from '../renderer/hull-layer.js';
import { clusterHulls } from '../utils/convex-hull.js';

// ─── Shaders ───

const SCATTER_VERT = `#version 300 es
precision highp float;

layout(location = 0) in float a_x;
layout(location = 1) in float a_y;
layout(location = 2) in float a_colorData;

uniform mat4 u_projection;
uniform float u_pointSize;

out float v_colorData;

void main() {
  gl_Position = u_projection * vec4(a_x, a_y, 0.0, 1.0);
  gl_PointSize = u_pointSize;
  v_colorData = a_colorData;
}
`;

const SCATTER_FRAG = `#version 300 es
precision highp float;

in float v_colorData;

uniform sampler2D u_colorScale;
uniform sampler2D u_palette;
uniform float u_colorMode;   // 0=colorscale, 1=palette
uniform float u_opacity;

out vec4 fragColor;

void main() {
  vec2 cxy = 2.0 * gl_PointCoord - 1.0;
  float r = dot(cxy, cxy);
  if (r > 1.0) discard;

  float alpha = 1.0 - smoothstep(0.8, 1.0, r);

  vec4 color;
  if (u_colorMode > 0.5) {
    // Palette texture is always 256px wide; index stored in v_colorData (0-255)
    color = texture(u_palette, vec2((v_colorData + 0.5) / 256.0, 0.5));
  } else {
    color = texture(u_colorScale, vec2(v_colorData, 0.5));
  }

  fragColor = vec4(color.rgb, color.a * alpha * u_opacity);
}
`;

// ─── Types ───

export interface ScatterData {
  x: Float32Array;
  y: Float32Array;
  /** Continuous values for colorscale mapping (0–1 normalized) */
  values?: Float32Array;
  /** Per-point hex colors — takes priority over values */
  colors?: string[];
  /** Per-point cluster label strings */
  labels?: string[];
}

export interface ScatterTooltipData {
  index: number;
  x: number;
  y: number;
  label?: string;
  value?: number;
  color?: string;
}

export interface ScatterSelectEvent {
  indices: number[];
  type: 'box' | 'lasso';
}

export interface ScatterOptions extends BaseChartOptions {
  pointSize?: number;
  opacity?: number;
  colorScale?: ColorScale;
  autoFit?: boolean;
  /** Enable hover tooltip. Default: true */
  tooltip?: boolean;
  /** Custom tooltip content builder */
  tooltipFormatter?: (data: ScatterTooltipData) => { title?: string; rows: { label: string; value: string | number; color?: string }[] };
  /** Called when box/lasso selection completes with selected point indices */
  onSelectPoints?: (e: ScatterSelectEvent) => void;
  /** Show cluster legend panel. Default: true when labels are present */
  legend?: boolean;
  /** Legend panel title */
  legendTitle?: string;
  /** Legend panel position. Default: 'right' */
  legendPosition?: 'left' | 'right';
  /** X-axis label text */
  xLabel?: string;
  /** Y-axis label text */
  yLabel?: string;
}

// ─── Constants ───

const CLUSTER_PALETTE = [
  '#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd',
  '#8c564b', '#e377c2', '#7f7f7f', '#bcbd22', '#17becf',
  '#aec7e8', '#ffbb78', '#98df8a', '#ff9896', '#c5b0d5',
  '#c49c94', '#f7b6d2', '#c7c7c7', '#dbdb8d', '#9edae5',
];

// ─── Render Layer ───

class ScatterLayer implements RenderLayer {
  id = 'scatter';
  order = 10;
  private pointCount = 0;
  /** GL type for the color data attribute: FLOAT (values/palette-as-float) or UNSIGNED_SHORT */
  colorDataGLType: number = 0x1406; // WebGL FLOAT

  render(engine: RenderEngine, state: RenderState): void {
    if (this.pointCount === 0) return;

    const gl = engine.gl;
    const shader = engine.getShader('scatter');
    if (!shader) return;

    shader.use();
    shader.setUniform('u_projection', {
      type: 'mat4',
      value: cameraMatrix(state.viewport, state.camera),
    });

    const xBuf = engine.buffers.get('scatter_x');
    if (!xBuf) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, xBuf);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 1, gl.FLOAT, false, 0, 0);

    const yBuf = engine.buffers.get('scatter_y');
    if (!yBuf) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, yBuf);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 0, 0);

    const colorBuf = engine.buffers.get('scatter_colordata');
    if (colorBuf) {
      gl.bindBuffer(gl.ARRAY_BUFFER, colorBuf);
      gl.enableVertexAttribArray(2);
      gl.vertexAttribPointer(2, 1, this.colorDataGLType, false, 0, 0);
    }

    const csUnit = engine.textures.bind('scatter_colorscale');
    if (csUnit >= 0) shader.setUniform('u_colorScale', { type: 'sampler2D', value: csUnit });

    const palUnit = engine.textures.bind('scatter_palette');
    if (palUnit >= 0) shader.setUniform('u_palette', { type: 'sampler2D', value: palUnit });

    gl.drawArrays(gl.POINTS, 0, this.pointCount);

    gl.disableVertexAttribArray(0);
    gl.disableVertexAttribArray(1);
    gl.disableVertexAttribArray(2);
  }

  setPointCount(n: number): void { this.pointCount = n; }
}

// ─── Helpers ───

function pointInPolygon(px: number, py: number, poly: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y;
    const xj = poly[j].x, yj = poly[j].y;
    if (((yi > py) !== (yj > py)) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

// ─── Chart ───

export class ScatterChart extends BaseChart {
  private layer: ScatterLayer;
  private opts: Required<Pick<ScatterOptions, 'pointSize' | 'opacity' | 'colorScale' | 'autoFit' | 'tooltip' | 'legend' | 'legendPosition'>>;
  private tooltipFormatter?: ScatterOptions['tooltipFormatter'];
  private legendTitle?: string;
  private xLabel?: string;
  private yLabel?: string;
  private currentData: ScatterData | null = null;
  private spatialIndex: SpatialIndex | null = null;
  private tooltip: Tooltip | null = null;
  private lastHoveredIdx = -1;

  // Cluster legend state
  private cellLegend: CellLegend | null = null;
  private hiddenClusters = new Set<string>();
  private focusedCluster: string | null = null;
  /** label → auto-assigned or provided color */
  private clusterColorMap = new Map<string, string>();
  /** Current color mode */
  private _colorMode: 'cell-set' | 'expression' = 'cell-set';
  /** Hull overlay for cluster boundaries */
  private hullOverlay: HullOverlay | null = null;
  /** Per-point cluster index, uploaded directly as UNSIGNED_SHORT vertex attribute */
  private _clusterIdx: Uint16Array | null = null;
  /** Palette RGBA (nSlots × 4 floats), uploaded to scatter_palette texture */
  private _clusterRgba: Float32Array | null = null;
  /** Palette texture size (max slots allocated) */
  private _paletteCap = 0;

  constructor(container: HTMLElement, options: ScatterOptions = {}) {
    super(container, options);

    this.opts = {
      pointSize: options.pointSize ?? 5,
      opacity: options.opacity ?? 0.8,
      colorScale: options.colorScale ?? VIRIDIS,
      autoFit: options.autoFit ?? true,
      tooltip: options.tooltip ?? true,
      legend: options.legend ?? true,
      legendPosition: options.legendPosition ?? 'right',
    };
    this.tooltipFormatter = options.tooltipFormatter;
    this.legendTitle = options.legendTitle;
    this.xLabel = options.xLabel;
    this.yLabel = options.yLabel;

    this.engine.createShader('scatter', { vertex: SCATTER_VERT, fragment: SCATTER_FRAG });

    const lutData = colorScaleToTexture(this.opts.colorScale);
    this.engine.textures.createLUT('scatter_colorscale', lutData);

    // Pre-allocate palette texture (256×1 RGBA32F, NEAREST filtering for exact index lookup)
    const gl = this.engine.gl;
    this.engine.textures.create('scatter_palette', {
      width: 256, height: 1,
      internalFormat: gl.RGBA32F, format: gl.RGBA, type: gl.FLOAT,
      minFilter: gl.NEAREST, magFilter: gl.NEAREST,
      data: null,
    });
    this._paletteCap = 256;

    const shader = this.engine.getShader('scatter')!;
    shader.use();
    shader.setUniform('u_pointSize', { type: 'float', value: this.opts.pointSize });
    shader.setUniform('u_opacity', { type: 'float', value: this.opts.opacity });
    shader.setUniform('u_colorMode', { type: 'float', value: 0.0 });

    this.layer = new ScatterLayer();
    this.engine.addLayer(this.layer);

    if (this.opts.tooltip) {
      this.tooltip = new Tooltip(container);
      this.attachHoverHandler();
    }

    // Point size slider (floating, bottom-left)
    this.pointSizeSlider = this.createPointSizeSlider(container);

    // Selection via toolbar box/lasso tools
    if (options.onSelectPoints) {
      const cb = options.onSelectPoints;
      this.overlay.onSelect((e) => {
        const indices = this.hitTestSelection(e);
        cb({ indices, type: e.type });
      });
    }
  }

  // ─── Point Size Slider ───

  private pointSizeSlider: HTMLElement | null = null;

  private createPointSizeSlider(container: HTMLElement): HTMLElement {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:absolute;bottom:8px;left:52px;z-index:15;display:flex;align-items:center;gap:6px;background:rgba(20,20,20,0.82);border:1px solid rgba(255,255,255,0.12);border-radius:6px;padding:4px 10px;backdrop-filter:blur(6px);';

    const label = document.createElement('span');
    label.textContent = 'Size';
    label.style.cssText = 'color:rgba(200,200,200,0.7);font-size:11px;font-weight:600;';
    wrap.appendChild(label);

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '1';
    slider.max = '20';
    slider.step = '0.5';
    slider.value = String(this.opts.pointSize);
    slider.style.cssText = 'width:80px;accent-color:#e11d6d;cursor:pointer;';
    slider.addEventListener('input', () => {
      this.setPointSize(parseFloat(slider.value));
    });
    wrap.appendChild(slider);

    container.appendChild(wrap);
    return wrap;
  }

  // ─── Selection Hit Testing ───

  private hitTestSelection(e: SelectionEvent): number[] {
    if (!this.currentData) return [];
    const pr = this.engine.viewport.pixelRatio;
    const n = this.currentData.x.length;
    const indices: number[] = [];

    if (e.type === 'box') {
      for (let i = 0; i < n; i++) {
        const screen = worldToScreen(
          { x: this.currentData.x[i], y: this.currentData.y[i] },
          this.engine.viewport,
          this.engine.camera,
        );
        const cx = screen.x / pr;
        const cy = screen.y / pr;
        if (cx >= e.x && cx <= e.x + e.width && cy >= e.y && cy <= e.y + e.height) {
          indices.push(i);
        }
      }
    } else {
      const poly = e.points;
      for (let i = 0; i < n; i++) {
        const screen = worldToScreen(
          { x: this.currentData.x[i], y: this.currentData.y[i] },
          this.engine.viewport,
          this.engine.camera,
        );
        const cx = screen.x / pr;
        const cy = screen.y / pr;
        if (pointInPolygon(cx, cy, poly)) {
          indices.push(i);
        }
      }
    }

    return indices;
  }

  // ─── Hover / Tooltip ───

  private attachHoverHandler(): void {
    const canvas = this.engine.gl.canvas as HTMLCanvasElement;
    const onMove = throttle((e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      this.handleHover(e.clientX - rect.left, e.clientY - rect.top);
    }, 32);
    const onLeave = () => { this.tooltip?.hide(); this.lastHoveredIdx = -1; };
    canvas.addEventListener('mousemove', onMove as EventListener);
    canvas.addEventListener('mouseleave', onLeave);
  }

  private handleHover(screenX: number, screenY: number): void {
    const idx = this.hitTestFast(screenX, screenY);
    if (idx === this.lastHoveredIdx) { this.tooltip?.move(screenX, screenY); return; }
    this.lastHoveredIdx = idx;
    if (idx < 0 || !this.currentData) { this.tooltip?.hide(); return; }

    const data = this.currentData;
    const label = data.labels?.[idx];
    const color = data.colors?.[idx] ?? this.clusterColorMap.get(label ?? '');

    const tooltipData: ScatterTooltipData = {
      index: idx,
      x: data.x[idx],
      y: data.y[idx],
      label,
      value: data.values?.[idx],
      color,
    };

    const content = this.tooltipFormatter
      ? this.tooltipFormatter(tooltipData)
      : this.defaultTooltipContent(tooltipData);

    this.tooltip?.show(screenX, screenY, content);
  }

  private defaultTooltipContent(d: ScatterTooltipData) {
    const rows: { label: string; value: string | number; color?: string }[] = [
      { label: 'UMAP 1', value: d.x.toFixed(4) },
      { label: 'UMAP 2', value: d.y.toFixed(4) },
    ];
    if (d.value !== undefined) rows.push({ label: 'Value', value: d.value.toFixed(4) });
    if (d.label) rows.push({ label: 'Cluster', value: d.label, color: d.color });
    return { title: d.label ?? `Point #${d.index}`, rows };
  }

  // ─── Hit Testing ───

  private hitTestFast(screenX: number, screenY: number): number {
    if (!this.currentData || !this.spatialIndex) return -1;
    const pr = this.engine.viewport.pixelRatio;
    const world = screenToWorld(
      { x: screenX * pr, y: screenY * pr },
      this.engine.viewport,
      this.engine.camera,
    );
    const radius = (this.opts.pointSize * pr) / this.engine.viewport.width * 2 / this.engine.camera.zoom * 2;
    return this.spatialIndex.nearest(world.x, world.y, radius);
  }

  hitTest(screenX: number, screenY: number): number | null {
    const idx = this.hitTestFast(screenX, screenY);
    return idx >= 0 ? idx : null;
  }

  // ─── Cluster Legend ───

  private buildClusterColorMap(data: ScatterData): void {
    this.clusterColorMap.clear();
    if (!data.labels) return;

    const seen = new Map<string, number>(); // label → palette index
    let paletteIdx = 0;

    for (let i = 0; i < data.labels.length; i++) {
      const label = data.labels[i];
      if (!seen.has(label)) {
        // Use provided per-point color if available, else auto-assign from palette
        const color = data.colors?.[i] ?? CLUSTER_PALETTE[paletteIdx % CLUSTER_PALETTE.length];
        this.clusterColorMap.set(label, color);
        seen.set(label, paletteIdx++);
      }
    }
  }

  private buildLegendEntries(data: ScatterData): ClusterEntry[] {
    if (!data.labels) return [];
    // Use Uint32Array counts indexed by slot (faster than Map<string, number>)
    if (this._labelToSlot && this._clusterIdx) {
      const nSlots = this._labelToSlot.size;
      const slotCounts = new Uint32Array(nSlots);
      const idx = this._clusterIdx;
      for (let i = 0, n = idx.length; i < n; i++) slotCounts[idx[i]!]++;
      const slotToLabel = new Array<string>(nSlots);
      for (const [lbl, slot] of this._labelToSlot) slotToLabel[slot] = lbl;
      return Array.from({ length: nSlots }, (_, s) => ({
        label: slotToLabel[s]!,
        color: this.clusterColorMap.get(slotToLabel[s]!) ?? '#888',
        count: slotCounts[s]!,
        visible: !this.hiddenClusters.has(slotToLabel[s]!),
      })).sort((a, b) => b.count - a.count);
    }
    // fallback
    const counts = new Map<string, number>();
    for (const lbl of data.labels) counts.set(lbl, (counts.get(lbl) ?? 0) + 1);
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([label, count]) => ({
        label,
        color: this.clusterColorMap.get(label) ?? '#888',
        count,
        visible: !this.hiddenClusters.has(label),
      }));
  }

  private ensureLegend(container: HTMLElement, data: ScatterData): void {
    if (!this.opts.legend || !data.labels) {
      this.cellLegend?.hide();
      return;
    }

    if (!this.cellLegend) {
      this.cellLegend = new CellLegend(
        container,
        { position: this.opts.legendPosition, title: this.legendTitle },
        (label, visible) => {
          if (visible) this.hiddenClusters.delete(label);
          else this.hiddenClusters.add(label);
          this.focusedCluster = null;
          this.rebuildPalette();
          this.engine.requestRender();
        },
        (focused) => {
          this.focusedCluster = focused;
          this.hiddenClusters.clear();
          if (focused !== null) {
            for (const lbl of this.clusterColorMap.keys()) {
              if (lbl !== focused) this.hiddenClusters.add(lbl);
            }
          }
          this.rebuildPalette();
          this.engine.requestRender();
        },
      );
    }

    this.cellLegend.setEntries(this.buildLegendEntries(data));
    this.cellLegend.show();
  }

  /** Update palette texture with current visibility (O(nClusters), not O(nPoints)) */
  private rebuildPalette(): void {
    if (!this._clusterRgba || !this._labelToSlot) return;
    const rgba = this._clusterRgba;
    const nSlots = this._labelToSlot.size;

    // Apply visibility: set alpha=0 for hidden clusters
    const palData = new Float32Array(rgba.subarray(0, nSlots * 4));
    for (const [label, slot] of this._labelToSlot) {
      if (this.hiddenClusters.has(label)) palData[slot * 4 + 3] = 0;
    }

    this._uploadPalette(palData, nSlots);

    const shader = this.engine.getShader('scatter')!;
    shader.use();
    shader.setUniform('u_colorMode', { type: 'float', value: 1.0 });
  }

  private _uploadPalette(palData: Float32Array, nSlots: number): void {
    const gl = this.engine.gl;
    const managed = this.engine.textures.get('scatter_palette');
    if (!managed) return;
    // Palette texture is always 256×1 — pad unused slots with zeros
    let data256: Float32Array;
    if (palData.length >= 256 * 4) {
      data256 = palData.subarray(0, 256 * 4) as Float32Array;
    } else {
      data256 = new Float32Array(256 * 4);
      data256.set(palData.subarray(0, nSlots * 4));
    }
    gl.activeTexture(gl.TEXTURE0 + managed.unit);
    gl.bindTexture(gl.TEXTURE_2D, managed.texture);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 256, 1, gl.RGBA, gl.FLOAT, data256);
  }

  /** label → palette slot index */
  private _labelToSlot: Map<string, number> | null = null;

  // ─── Data Update ───

  update(data: ScatterData): void {
    this.storeData(data);
    this.currentData = data;
    const n = data.x.length;
    const dx = data.x;
    const dy = data.y;

    // ── Build label→slot map (single pass over labels if present) ──
    let labelToSlot: Map<string, number> | null = null;
    let clusterIdx: Uint16Array | null = null;

    if (data.labels) {
      labelToSlot = new Map<string, number>();
      clusterIdx = this._clusterIdx?.length === n ? this._clusterIdx : new Uint16Array(n);
      this._clusterIdx = clusterIdx;
    }

    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let slotCount = 0;
    const firstPointOfSlot: number[] = [];

    for (let i = 0; i < n; i++) {
      const x = dx[i]!;
      const y = dy[i]!;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      if (labelToSlot !== null && clusterIdx !== null) {
        const lbl = data.labels![i]!;
        let slot = labelToSlot.get(lbl);
        if (slot === undefined) {
          slot = slotCount++;
          labelToSlot.set(lbl, slot);
          firstPointOfSlot.push(i);
        }
        clusterIdx[i] = slot;
      }
    }

    // ── Upload x and y directly — zero CPU interleave work ──
    this.engine.setBuffer('scatter_x', { data: dx, usage: 'dynamic', size: 1 });
    this.engine.setBuffer('scatter_y', { data: dy, usage: 'dynamic', size: 1 });

    // ── Colors ──
    const shader = this.engine.getShader('scatter')!;
    shader.use();

    if (labelToSlot !== null && clusterIdx !== null) {
      // Palette path: ~nClusters work only (no N-point loop for colors)
      this.clusterColorMap.clear();
      this._labelToSlot = labelToSlot;

      const nSlots = slotCount;
      if (!this._clusterRgba || this._clusterRgba.length < nSlots * 4) {
        this._clusterRgba = new Float32Array(Math.max(nSlots, 64) * 4);
      }
      const rgba = this._clusterRgba;

      let paletteIdx = 0;
      for (const [lbl, slot] of labelToSlot) {
        const firstPt = firstPointOfSlot[slot]!;
        const hex = data.colors?.[firstPt] ?? CLUSTER_PALETTE[paletteIdx % CLUSTER_PALETTE.length]!;
        this.clusterColorMap.set(lbl, hex);
        const c = hexToVec4(hex);
        rgba[slot * 4]     = c.r;
        rgba[slot * 4 + 1] = c.g;
        rgba[slot * 4 + 2] = c.b;
        rgba[slot * 4 + 3] = c.a;
        paletteIdx++;
      }

      // Upload cluster index buffer (Uint16 directly — no float conversion)
      this.layer.colorDataGLType = 0x1403; // gl.UNSIGNED_SHORT
      this.engine.setBuffer('scatter_colordata', { data: clusterIdx, usage: 'dynamic', size: 1 });

      this.rebuildPalette();
    } else if (data.colors || data.values) {
      // Palette from unique explicit colors, OR colorscale for values
      this.buildClusterColorMap(data);

      if (data.values) {
        this.layer.colorDataGLType = 0x1406; // gl.FLOAT
        this.engine.setBuffer('scatter_colordata', { data: data.values, usage: 'dynamic', size: 1 });
        shader.setUniform('u_colorMode', { type: 'float', value: 0.0 });
      } else {
        // Build compact palette from unique hex colors
        const uniqueColors = new Map<string, number>();
        const idxBuf = new Uint8Array(n);
        let palIdx = 0;
        for (let i = 0; i < n; i++) {
          const hex = data.colors![i]!;
          let slot = uniqueColors.get(hex);
          if (slot === undefined) { slot = palIdx++; uniqueColors.set(hex, slot); }
          idxBuf[i] = slot;
        }
        const nSlots = palIdx;
        const palData = new Float32Array(nSlots * 4);
        for (const [hex, slot] of uniqueColors) {
          const c = hexToVec4(hex);
          palData[slot * 4] = c.r; palData[slot * 4 + 1] = c.g;
          palData[slot * 4 + 2] = c.b; palData[slot * 4 + 3] = c.a;
        }
        this.layer.colorDataGLType = 0x1401; // gl.UNSIGNED_BYTE
        this.engine.setBuffer('scatter_colordata', { data: idxBuf, usage: 'dynamic', size: 1 });
        this._uploadPalette(palData, nSlots);
        shader.setUniform('u_colorMode', { type: 'float', value: 1.0 });
      }
    } else {
      this.buildClusterColorMap(data);
      shader.setUniform('u_colorMode', { type: 'float', value: 0.0 });
    }

    this.layer.setPointCount(n);

    // ── SpatialIndex: always defer to avoid blocking first frame ──
    this.spatialIndex = null;
    const capturedX = dx;
    const capturedY = dy;
    setTimeout(() => {
      if (this.currentData?.x === capturedX) {
        this.spatialIndex = new SpatialIndex(capturedX, capturedY);
      }
    }, 0);

    // Legend
    this.ensureLegend(this.container, data);

    // ── autoFit: use pre-computed min/max (no extra loop) ──
    if (this.opts.autoFit) {
      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;
      const rangeX = maxX - minX || 1;
      const rangeY = maxY - minY || 1;
      const aspect = this.engine.viewport.width / this.engine.viewport.height;
      const zoom = Math.min(2 * aspect / (rangeX * 1.1), 2 / (rangeY * 1.1));
      this.engine.camera = { center: { x: cx, y: cy }, zoom };
    }

    const vw = this.engine.viewport.width / this.engine.viewport.pixelRatio;
    const vh = this.engine.viewport.height / this.engine.viewport.pixelRatio;
    this.overlay.resize(vw, vh);

    if (this.showAxes && (this.xLabel || this.yLabel)) {
      const area = this.plotArea;
      this.text.resize(vw, vh);
      const axisColor = { r: 0.6, g: 0.7, b: 0.8, a: 1 };
      if (this.xLabel) {
        this.text.add(this.xLabel, area.x + area.width / 2, area.y + area.height + 8, {
          color: axisColor, fontSize: 12, align: 'center', baseline: 'top',
        });
      }
      if (this.yLabel) {
        this.text.add(this.yLabel, 14, area.y + area.height / 2, {
          color: axisColor, fontSize: 12, align: 'center', baseline: 'middle',
          rotation: -Math.PI / 2,
        });
      }
      this.text.flush();
    }

    this.engine.requestRender();
  }

  // ─── Public Setters ───

  setPointSize(size: number): void {
    this.opts.pointSize = size;
    const shader = this.engine.getShader('scatter');
    if (shader) { shader.use(); shader.setUniform('u_pointSize', { type: 'float', value: size }); this.engine.requestRender(); }
  }

  setColorScale(scale: ColorScale): void {
    this.opts.colorScale = scale;
    this.engine.textures.createLUT('scatter_colorscale', colorScaleToTexture(scale));
    this.engine.requestRender();
  }

  setOpacity(opacity: number): void {
    this.opts.opacity = opacity;
    const shader = this.engine.getShader('scatter');
    if (shader) { shader.use(); shader.setUniform('u_opacity', { type: 'float', value: opacity }); this.engine.requestRender(); }
  }

  // ─── Async Update (LoD) ───

  /** Points above this threshold are downsampled via Worker before rendering. */
  static readonly LOD_THRESHOLD = 500_000;

  /**
   * Like `update()` but offloads heavy work to a DataWorker.
   * When `data.x.length > LOD_THRESHOLD`, the dataset is downsampled asynchronously
   * so the main thread isn't blocked. Use this for datasets > ~500k points.
   *
   * @example
   * import DataWorkerImpl from '@seegak/core/worker/data-worker-impl?worker';
   * const worker = DataWorker.fromWorker(new DataWorkerImpl());
   * await chart.updateAsync(data, worker);
   */
  async updateAsync(data: ScatterData, worker: DataWorker): Promise<void> {
    const n = data.x.length;
    if (n <= ScatterChart.LOD_THRESHOLD) {
      this.update(data);
      return;
    }

    const result = await worker.downsample(data.x, data.y, ScatterChart.LOD_THRESHOLD, data.values);
    const { indices } = result;

    const downsampled: ScatterData = {
      x: result.x,
      y: result.y,
      values: result.values,
      labels: data.labels ? Array.from(indices, i => data.labels![i]) : undefined,
      colors: data.colors ? Array.from(indices, i => data.colors![i]) : undefined,
    };

    this.update(downsampled);
  }

  // ─── Color Mode ──────────────────────────────────────────────────────────

  /** Get current color mode */
  get colorMode(): 'cell-set' | 'expression' { return this._colorMode; }

  /**
   * Switch coloring between cluster labels and expression values.
   * Requires data to have both `labels` and `values` to be meaningful.
   */
  setColorMode(mode: 'cell-set' | 'expression'): void {
    if (mode === this._colorMode) return;
    this._colorMode = mode;

    const shader = this.engine.getShader('scatter');
    if (!shader) return;
    shader.use();

    if (mode === 'expression') {
      // Switch to colorscale mode (u_colorMode = 0)
      shader.setUniform('u_colorMode', { type: 'float', value: 0.0 });
      // Re-upload values as the color data attribute if available
      if (this.currentData?.values) {
        this.engine.setBuffer('scatter_color', {
          data: this.currentData.values,
          usage: 'dynamic',
          size: 1,
        });
        this.layer.colorDataGLType = this.engine.gl.FLOAT;
      }
    } else {
      // Switch to palette mode (u_colorMode = 1)
      shader.setUniform('u_colorMode', { type: 'float', value: 1.0 });
      // Re-upload cluster indices if available
      if (this._clusterIdx) {
        this.engine.setBuffer('scatter_color', {
          data: this._clusterIdx,
          usage: 'dynamic',
          size: 1,
        });
        this.layer.colorDataGLType = this.engine.gl.UNSIGNED_SHORT;
      }
    }

    this.engine.requestRender();
  }

  // ─── Convex Hull ────────────────────────────────────────────────────────

  /** Toggle convex hull overlay for cluster boundaries */
  setShowHull(show: boolean): void {
    if (!this.currentData?.labels) return;

    if (show) {
      if (!this.hullOverlay) {
        this.hullOverlay = new HullOverlay(this.container);
      }
      // Compute hulls
      const hulls = clusterHulls(this.currentData.x, this.currentData.y, this.currentData.labels);
      this.hullOverlay.setData({ hulls, colors: this.clusterColorMap });
      this.hullOverlay.setTransform((wx, wy) => {
        const pr = this.engine.viewport.pixelRatio;
        const screen = worldToScreen({ x: wx, y: wy }, this.engine.viewport, this.engine.camera);
        return [screen.x / pr, screen.y / pr];
      });
      this.hullOverlay.show();
    } else {
      this.hullOverlay?.hide();
    }
  }

  get showHull(): boolean {
    return this.hullOverlay?.toggle !== undefined && this.hullOverlay !== null;
  }

  // ─── Download ─────────────────────────────────────────────────────────────

  protected override getDownloadOptions(): DownloadOption[] {
    const base: DownloadOption[] = [
      { id: 'png', label: 'PNG Image', description: 'High-resolution raster image (2x)' },
      { id: 'svg', label: 'SVG Image', description: 'Vector graphics' },
    ];
    if (this.currentData) {
      base.push({ id: 'csv-embedding', label: 'Embedding CSV', description: 'X, Y coordinates + labels' });
      if (this.currentData.labels) {
        base.push({ id: 'csv-obs-sets', label: 'Cell Sets CSV', description: 'Cell index, cluster label' });
      }
    }
    return base;
  }

  protected override handleDownloadSelect(id: string): void {
    if (id === 'png') { this.exportPNG(); return; }
    if (id === 'svg') { this.exportSVG(); return; }

    const data = this.currentData;
    if (!data) return;

    if (id === 'csv-embedding') {
      const columns: Array<{ header: string; values: ArrayLike<number> | string[] }> = [
        { header: 'x', values: data.x },
        { header: 'y', values: data.y },
      ];
      if (data.labels) columns.push({ header: 'label', values: data.labels });
      if (data.colors) columns.push({ header: 'color', values: data.colors });
      exportCSV(columns, 'embedding.csv');
    } else if (id === 'csv-obs-sets') {
      if (!data.labels) return;
      const indices = Array.from({ length: data.labels.length }, (_, i) => String(i));
      exportCSV([
        { header: 'index', values: indices },
        { header: 'label', values: data.labels },
      ], 'cell-sets.csv');
    }
  }

  destroy(): void {
    this.pointSizeSlider?.remove();
    this.hullOverlay?.destroy();
    this.cellLegend?.destroy();
    this.tooltip?.destroy();
    super.destroy();
  }
}
