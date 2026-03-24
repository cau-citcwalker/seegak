import type { Vec2 } from '../types.js';
import type { RenderEngine } from './render-engine.js';
import type { ToolType } from './chart-toolbar.js';
import { screenToWorld, worldToScreen } from '../utils/math.js';

// ─── Selection Events ───

export interface BoxSelectEvent {
  type: 'box';
  /** Screen-space coordinates (CSS pixels) */
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LassoSelectEvent {
  type: 'lasso';
  /** Screen-space polygon points (CSS pixels) */
  points: Vec2[];
}

export type SelectionEvent = BoxSelectEvent | LassoSelectEvent;

// ─── Annotation ───

interface Annotation {
  type: 'stroke' | 'line';
  /** World-space coordinates — follows pan/zoom automatically */
  points: Vec2[];
  color: string;
  lineWidth: number;
}

// ─── AnnotationOverlay ───

export class AnnotationOverlay {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  private annotations: Annotation[] = [];
  /** Points being drawn (world-space if interactive, CSS-space if not) */
  private currentPoints: Vec2[] = [];
  private isDrawing = false;
  /** Line start point */
  private lineStart: Vec2 | null = null;
  private _tool: ToolType = 'pan';

  private selectCallbacks: Array<(e: SelectionEvent) => void> = [];
  private engine: RenderEngine;

  /** When false, annotations are stored in CSS-space and don't follow camera */
  private _interactive = true;

  // Camera polling to redraw annotations when InteractionHandler pans
  private lastCamZoom = 0;
  private lastCamCX = 0;
  private lastCamCY = 0;
  private rafId = 0;

  // Point decimation: skip draw/lasso points closer than this (CSS px²)
  private static readonly MIN_DIST_SQ = 16; // 4px minimum distance
  private lastAddedCSS: Vec2 | null = null;

  constructor(container: HTMLElement, engine: RenderEngine, interactive = true) {
    this.engine = engine;
    this._interactive = interactive;

    this.canvas = document.createElement('canvas');
    this.canvas.style.cssText = [
      'position:absolute',
      'top:0',
      'left:0',
      'width:100%',
      'height:100%',
      'pointer-events:none',
      'z-index:1',
    ].join(';');
    container.appendChild(this.canvas);

    this.ctx = this.canvas.getContext('2d')!;

    this.canvas.addEventListener('wheel', this.onWheel, { passive: false });
    this.canvas.addEventListener('mousedown', this.onMouseDown);
    this.canvas.addEventListener('mousemove', this.onMouseMove);
    this.canvas.addEventListener('mouseup', this.onMouseUp);
    this.canvas.addEventListener('mouseleave', this.onMouseLeave);

    this.startCameraLoop();
  }

  // ─── Public API ───

  setTool(tool: ToolType): void {
    this._tool = tool;
    this.isDrawing = false;
    this.lineStart = null;
    this.currentPoints = [];
    this.canvas.style.pointerEvents = tool === 'pan' ? 'none' : 'auto';
    this.canvas.style.cursor = this.cursorFor(tool);
    this.redraw();
  }

  resize(w: number, h: number): void {
    this.canvas.width = w;
    this.canvas.height = h;
    this.redraw();
  }

  clearAnnotations(): void {
    this.annotations = [];
    this.redraw();
  }

  onSelect(cb: (e: SelectionEvent) => void): () => void {
    this.selectCallbacks.push(cb);
    return () => {
      const i = this.selectCallbacks.indexOf(cb);
      if (i !== -1) this.selectCallbacks.splice(i, 1);
    };
  }

  // ─── Camera Loop ───

  /** Poll camera each frame; redraw annotations when InteractionHandler pans/zooms */
  private startCameraLoop(): void {
    const loop = () => {
      // Skip camera check when nothing is drawn (annotations + active stroke)
      if (this.annotations.length > 0 || this.currentPoints.length > 0 || this.lineStart !== null) {
        const cam = this.engine.camera;
        if (
          cam.zoom !== this.lastCamZoom ||
          cam.center.x !== this.lastCamCX ||
          cam.center.y !== this.lastCamCY
        ) {
          this.lastCamZoom = cam.zoom;
          this.lastCamCX = cam.center.x;
          this.lastCamCY = cam.center.y;
          this.redraw();
        }
      }
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  // ─── Internal ───

  private cursorFor(tool: ToolType): string {
    if (tool === 'pan') return 'grab';
    if (tool === 'eraser') return 'cell';
    return 'crosshair';
  }

  // ─── Coordinate Helpers ───

  /** CSS pixel position from mouse event */
  private clientPos(e: MouseEvent): Vec2 {
    const rect = this.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  /** CSS pixel → storage space (world if interactive, CSS if not) */
  private cssToStorage(css: Vec2): Vec2 {
    if (!this._interactive) return { x: css.x, y: css.y };
    const pr = this.engine.viewport.pixelRatio;
    return screenToWorld(
      { x: css.x * pr, y: css.y * pr },
      this.engine.viewport,
      this.engine.camera,
    );
  }

  /** Storage space → CSS pixel */
  private storageToCSS(w: Vec2): Vec2 {
    if (!this._interactive) return { x: w.x, y: w.y };
    const pr = this.engine.viewport.pixelRatio;
    const dev = worldToScreen(w, this.engine.viewport, this.engine.camera);
    return { x: dev.x / pr, y: dev.y / pr };
  }

  // ─── Event Handlers ───

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    this.engine.camera.zoom = Math.max(0.01, Math.min(1000, this.engine.camera.zoom * factor));
    this.engine.requestRender();
    this.redraw();
  };

  private onMouseDown = (e: MouseEvent): void => {
    if (e.button !== 0) return;
    const css = this.clientPos(e);

    if (this._tool === 'eraser') {
      this.eraseAt(css);
      this.isDrawing = true;
      return;
    }

    const world = this.cssToStorage(css);

    if (this._tool === 'line') {
      if (!this.lineStart) {
        this.lineStart = world;
      } else {
        this.annotations.push({
          type: 'line',
          points: [this.lineStart, world],
          color: '#60a5fa',
          lineWidth: 1.5,
        });
        this.lineStart = null;
        this.redraw();
      }
      return;
    }

    this.isDrawing = true;
    this.currentPoints = [world];
    this.lastAddedCSS = css;
  };

  private onMouseMove = (e: MouseEvent): void => {
    const css = this.clientPos(e);

    if (this._tool === 'eraser') {
      if (this.isDrawing) this.eraseAt(css);
      this.redraw();
      this.drawEraserPreview(css);
      return;
    }

    const world = this.cssToStorage(css);

    if (this._tool === 'line' && this.lineStart) {
      this.redraw();
      this.drawLinePreview(this.storageToCSS(this.lineStart), css);
      return;
    }

    if (!this.isDrawing) return;

    // Point decimation for draw/lasso: skip points too close to the last one
    if (this._tool === 'draw' || this._tool === 'lasso') {
      if (this.lastAddedCSS) {
        const dx = css.x - this.lastAddedCSS.x;
        const dy = css.y - this.lastAddedCSS.y;
        if (dx * dx + dy * dy < AnnotationOverlay.MIN_DIST_SQ) return;
      }
      this.lastAddedCSS = css;
    }

    this.currentPoints.push(world);
    this.redraw();

    if (this._tool === 'draw') this.drawStrokePreview();
    else if (this._tool === 'box-select') this.drawBoxPreview();
    else if (this._tool === 'lasso') this.drawLassoPreview();
  };

  private onMouseUp = (e: MouseEvent): void => {
    if (e.button !== 0 || !this.isDrawing) return;
    if (this._tool === 'eraser') { this.isDrawing = false; this.redraw(); return; }
    const css = this.clientPos(e);
    this.isDrawing = false;

    if (this._tool === 'draw') {
      if (this.currentPoints.length > 1) {
        this.annotations.push({
          type: 'stroke',
          points: [...this.currentPoints],
          color: '#f87171',
          lineWidth: 2,
        });
      }
      this.currentPoints = [];
      this.redraw();
    } else if (this._tool === 'box-select') {
      const startCSS = this.currentPoints[0] ? this.storageToCSS(this.currentPoints[0]) : css;
      const x = Math.min(startCSS.x, css.x);
      const y = Math.min(startCSS.y, css.y);
      const width = Math.abs(css.x - startCSS.x);
      const height = Math.abs(css.y - startCSS.y);
      this.currentPoints = [];
      this.redraw();
      if (width > 4 || height > 4) {
        for (const cb of this.selectCallbacks) cb({ type: 'box', x, y, width, height });
      }
    } else if (this._tool === 'lasso') {
      // Convert world points to CSS px for the selection event
      const pts = this.currentPoints.map(w => this.storageToCSS(w));
      this.currentPoints = [];
      this.redraw();
      if (pts.length > 4) {
        for (const cb of this.selectCallbacks) cb({ type: 'lasso', points: pts });
      }
    }
  };

  private onMouseLeave = (): void => {
    if (this._tool === 'eraser') {
      this.isDrawing = false;
      this.redraw();
      return;
    }
    if (this.isDrawing && (this._tool === 'box-select' || this._tool === 'lasso')) {
      this.isDrawing = false;
      this.currentPoints = [];
      this.redraw();
    }
  };

  // ─── Drawing ───

  private redraw(): void {
    const { width, height } = this.canvas;
    if (width === 0 || height === 0) return;
    this.ctx.clearRect(0, 0, width, height);
    for (const ann of this.annotations) this.drawAnnotation(ann);
  }

  private drawAnnotation(ann: Annotation): void {
    if (ann.points.length < 2) return;
    const ctx = this.ctx;
    ctx.strokeStyle = ann.color;
    ctx.lineWidth = ann.lineWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.setLineDash([]);
    ctx.beginPath();
    const p0 = this.storageToCSS(ann.points[0]);
    ctx.moveTo(p0.x, p0.y);
    for (let i = 1; i < ann.points.length; i++) {
      const p = this.storageToCSS(ann.points[i]);
      ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
  }

  private drawStrokePreview(): void {
    const pts = this.currentPoints;
    if (pts.length < 2) return;
    const ctx = this.ctx;
    ctx.strokeStyle = '#f87171';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.setLineDash([]);
    ctx.beginPath();
    const p0 = this.storageToCSS(pts[0]);
    ctx.moveTo(p0.x, p0.y);
    for (let i = 1; i < pts.length; i++) {
      const p = this.storageToCSS(pts[i]);
      ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
  }

  private drawLinePreview(start: Vec2, end: Vec2): void {
    const ctx = this.ctx;
    ctx.strokeStyle = '#60a5fa';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 3]);
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#60a5fa';
    ctx.beginPath(); ctx.arc(start.x, start.y, 3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(end.x, end.y, 3, 0, Math.PI * 2); ctx.fill();
  }

  private drawBoxPreview(): void {
    if (this.currentPoints.length < 2) return;
    const start = this.storageToCSS(this.currentPoints[0]);
    const end = this.storageToCSS(this.currentPoints[this.currentPoints.length - 1]);
    const x = Math.min(start.x, end.x);
    const y = Math.min(start.y, end.y);
    const w = Math.abs(end.x - start.x);
    const h = Math.abs(end.y - start.y);
    const ctx = this.ctx;
    ctx.strokeStyle = '#60a5fa';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 3]);
    ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = 'rgba(96,165,250,0.08)';
    ctx.fillRect(x, y, w, h);
    ctx.setLineDash([]);
  }

  private readonly ERASER_RADIUS = 14;

  /** Distance from point p to line segment [a, b] (CSS px) */
  private pointToSegmentDist(p: Vec2, a: Vec2, b: Vec2): number {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) {
      const ex = p.x - a.x, ey = p.y - a.y;
      return Math.sqrt(ex * ex + ey * ey);
    }
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
    const cx = a.x + t * dx - p.x;
    const cy = a.y + t * dy - p.y;
    return Math.sqrt(cx * cx + cy * cy);
  }

  /** Remove annotations whose any segment passes within ERASER_RADIUS of p (CSS px) */
  private eraseAt(p: Vec2): void {
    const r = this.ERASER_RADIUS;
    const before = this.annotations.length;
    this.annotations = this.annotations.filter(ann => {
      const cssPts = ann.points.map(w => this.storageToCSS(w));
      for (let i = 0; i < cssPts.length - 1; i++) {
        if (this.pointToSegmentDist(p, cssPts[i], cssPts[i + 1]) <= r) return false;
      }
      return true;
    });
    if (this.annotations.length !== before) this.redraw();
  }

  private drawEraserPreview(p: Vec2): void {
    const ctx = this.ctx;
    const r = this.ERASER_RADIUS;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([3, 2]);
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  private drawLassoPreview(): void {
    const pts = this.currentPoints;
    if (pts.length < 2) return;
    const ctx = this.ctx;
    ctx.strokeStyle = '#a78bfa';
    ctx.lineWidth = 1.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.setLineDash([4, 3]);
    ctx.fillStyle = 'rgba(167,139,250,0.08)';
    ctx.beginPath();
    const p0 = this.storageToCSS(pts[0]);
    ctx.moveTo(p0.x, p0.y);
    for (let i = 1; i < pts.length; i++) {
      const p = this.storageToCSS(pts[i]);
      ctx.lineTo(p.x, p.y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.setLineDash([]);
  }

  destroy(): void {
    cancelAnimationFrame(this.rafId);
    this.canvas.removeEventListener('wheel', this.onWheel);
    this.canvas.removeEventListener('mousedown', this.onMouseDown);
    this.canvas.removeEventListener('mousemove', this.onMouseMove);
    this.canvas.removeEventListener('mouseup', this.onMouseUp);
    this.canvas.removeEventListener('mouseleave', this.onMouseLeave);
    this.canvas.remove();
    this.selectCallbacks = [];
  }
}
