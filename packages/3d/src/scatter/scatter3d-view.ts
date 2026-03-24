import { BaseChart, CellLegend } from '@seegak/bio-charts';
import type { ClusterEntry } from '@seegak/bio-charts';
import type { Scatter3DData, Scatter3DOptions } from '../types.js';
import { Scatter3DLayer } from './scatter3d-layer.js';
import { Scatter3DToolbar } from './scatter3d-toolbar.js';
import { ArcballCamera } from '../math/arcball.js';
import { mat4Perspective } from '../math/mat4.js';

/**
 * 3-D scatter plot for UMAP / tSNE / PCA embeddings.
 *
 * Renders points with per-cluster colors in a 3D space with arcball camera.
 * Supports toggling between 3D and flattened 2D mode.
 */
export class Scatter3DView extends BaseChart {
  private readonly layer: Scatter3DLayer;
  private readonly arcball: ArcballCamera;
  readonly toolbar3D: Scatter3DToolbar;
  private currentData: Scatter3DData | null = null;
  private _flatten: boolean;
  private cellLegend: CellLegend | null = null;
  private hiddenClusters = new Set<string>();

  // Interaction state
  private pointerDown = false;
  private pointerButton = 0; // 0=left(rotate), 2=right(pan)
  private lastX = 0;
  private lastY = 0;

  constructor(container: HTMLElement, options: Scatter3DOptions = {}) {
    super(container, {
      ...options,
      toolbar: options.toolbar ?? false,
      interactive: false,
    });

    this._flatten = options.flatten ?? false;
    this.arcball = new ArcballCamera();

    this.layer = new Scatter3DLayer();
    this.layer.pointSize = options.pointSize ?? 4;
    this.layer.opacity = options.opacity ?? 0.85;

    // 3D-specific toolbar
    this.toolbar3D = new Scatter3DToolbar(container, {
      onFlattenChange: (v) => this.setFlatten(v),
      onPointSizeChange: (v) => this.setPointSize(v),
      onResetCamera: () => this.resetCamera(),
    }, {
      initialPointSize: options.pointSize ?? 4,
      initialFlatten: options.flatten ?? false,
    });

    this.updateMatrices();
    this.engine.addLayer(this.layer);
    this.attachInteraction();
    this.engine.requestRender();
  }

  // ─── BaseChart abstract method ────────────────────────────────────────────

  update(data: Scatter3DData): void {
    this.setData(data);
  }

  // ─── Public API ───────────────────────────────────────────────────────────

  setData(data: Scatter3DData): void {
    this.currentData = data;
    this.hiddenClusters.clear();
    this.layer.setData(data, this.engine.gl, this._flatten);

    // Auto-fit camera to data bounds
    const bbox = this.computeBBox(data);
    const cx = (bbox.min[0] + bbox.max[0]) / 2;
    const cy = (bbox.min[1] + bbox.max[1]) / 2;
    const cz = (bbox.min[2] + bbox.max[2]) / 2;
    const diag = Math.sqrt(
      (bbox.max[0] - bbox.min[0]) ** 2 +
      (bbox.max[1] - bbox.min[1]) ** 2 +
      (bbox.max[2] - bbox.min[2]) ** 2,
    );
    this.arcball.setTarget([cx, cy, cz]);
    this.arcball.setDistance(diag * 1.2);
    this.updateMatrices();
    this.engine.requestRender();

    // Build cluster legend
    this.buildLegend(data);
  }

  private buildLegend(data: Scatter3DData): void {
    if (!data.labels) {
      this.cellLegend?.hide();
      return;
    }

    const labelColors = this.layer.getLabelColors(data);
    const counts = new Map<string, number>();
    for (const l of data.labels) counts.set(l, (counts.get(l) ?? 0) + 1);

    const entries: ClusterEntry[] = labelColors.map(({ label, color }) => ({
      label,
      color,
      count: counts.get(label) ?? 0,
      visible: !this.hiddenClusters.has(label),
    })).sort((a, b) => b.count - a.count);

    if (!this.cellLegend) {
      this.cellLegend = new CellLegend(
        this.container,
        { position: 'right', title: 'Cell Types' },
        (label: string, visible: boolean) => {
          if (visible) this.hiddenClusters.delete(label);
          else this.hiddenClusters.add(label);
          this.refreshWithHidden();
        },
        (focusLabel: string | null) => {
          if (focusLabel) {
            // Focus: hide all except this one
            for (const e of entries) {
              if (e.label !== focusLabel) this.hiddenClusters.add(e.label);
              else this.hiddenClusters.delete(e.label);
            }
          } else {
            this.hiddenClusters.clear();
          }
          this.refreshWithHidden();
        },
      );
    }

    this.cellLegend.setEntries(entries);
    this.cellLegend.show();
  }

  private refreshWithHidden(): void {
    if (!this.currentData) return;
    this.layer.setData(this.currentData, this.engine.gl, this._flatten, this.hiddenClusters);
    this.engine.requestRender();
  }

  setPointSize(size: number): void {
    this.layer.pointSize = size;
    this.toolbar3D.setPointSize(size);
    this.engine.requestRender();
  }

  setOpacity(v: number): void {
    this.layer.opacity = Math.max(0, Math.min(1, v));
    this.engine.requestRender();
  }

  /** Toggle between 3D and flattened 2D mode */
  setFlatten(flatten: boolean): void {
    this._flatten = flatten;
    this.toolbar3D.setFlatten(flatten);
    if (this.currentData) {
      this.layer.setData(this.currentData, this.engine.gl, flatten, this.hiddenClusters);
      this.engine.requestRender();
    }
  }

  get flatten(): boolean { return this._flatten; }

  /** Get label→color mapping for external legend rendering */
  getLabelColors(): Array<{ label: string; color: string }> {
    if (!this.currentData) return [];
    return this.layer.getLabelColors(this.currentData);
  }

  override resetCamera(): void {
    this.arcball.reset();
    if (this.currentData) {
      const bbox = this.computeBBox(this.currentData);
      const cx = (bbox.min[0] + bbox.max[0]) / 2;
      const cy = (bbox.min[1] + bbox.max[1]) / 2;
      const cz = (bbox.min[2] + bbox.max[2]) / 2;
      const diag = Math.sqrt(
        (bbox.max[0] - bbox.min[0]) ** 2 +
        (bbox.max[1] - bbox.min[1]) ** 2 +
        (bbox.max[2] - bbox.min[2]) ** 2,
      );
      this.arcball.setTarget([cx, cy, cz]);
      this.arcball.setDistance(diag * 1.2);
    }
    this.updateMatrices();
    this.engine.requestRender();
  }

  // ─── Interaction ──────────────────────────────────────────────────────────

  private attachInteraction(): void {
    const canvas = this.engine.gl.canvas as HTMLCanvasElement;
    canvas.addEventListener('mousedown', this.onMouseDown);
    canvas.addEventListener('mousemove', this.onMouseMove);
    canvas.addEventListener('mouseup', this.onMouseUp);
    canvas.addEventListener('mouseleave', this.onMouseUp);
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
    canvas.addEventListener('keydown', this.onKeyDown);
    canvas.addEventListener('touchstart', this.onTouchStart, { passive: false });
    canvas.addEventListener('touchmove', this.onTouchMove, { passive: false });
    canvas.addEventListener('touchend', this.onTouchEnd);
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.tabIndex = 0;
  }

  private detachInteraction(): void {
    const canvas = this.engine.gl.canvas as HTMLCanvasElement;
    canvas.removeEventListener('mousedown', this.onMouseDown);
    canvas.removeEventListener('mousemove', this.onMouseMove);
    canvas.removeEventListener('mouseup', this.onMouseUp);
    canvas.removeEventListener('mouseleave', this.onMouseUp);
    canvas.removeEventListener('wheel', this.onWheel);
    canvas.removeEventListener('keydown', this.onKeyDown);
    canvas.removeEventListener('touchstart', this.onTouchStart);
    canvas.removeEventListener('touchmove', this.onTouchMove);
    canvas.removeEventListener('touchend', this.onTouchEnd);
  }

  private readonly onMouseDown = (e: MouseEvent): void => {
    e.preventDefault();
    this.pointerDown = true;
    this.pointerButton = e.button;
    this.lastX = e.clientX;
    this.lastY = e.clientY;
    (e.currentTarget as HTMLElement).focus?.();
  };

  private readonly onMouseMove = (e: MouseEvent): void => {
    if (!this.pointerDown) return;
    const dx = e.clientX - this.lastX;
    const dy = e.clientY - this.lastY;
    this.lastX = e.clientX;
    this.lastY = e.clientY;

    if (this.pointerButton === 2 || e.shiftKey) {
      // Right-drag or shift+drag → pan
      this.arcball.handlePan(dx, dy);
    } else {
      // Left-drag → rotate
      this.arcball.handleMouseDrag(dx, dy);
    }
    this.updateMatrices();
    this.engine.requestRender();
  };

  private readonly onMouseUp = (): void => { this.pointerDown = false; };

  private readonly onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    this.arcball.handleWheel(e.deltaY);
    this.updateMatrices();
    this.engine.requestRender();
  };

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'r' || e.key === 'R') this.resetCamera();
    if (e.key === 'f' || e.key === 'F') this.setFlatten(!this._flatten);
  };

  // Touch
  private lastTouchX = 0;
  private lastTouchY = 0;
  private lastTouchDist = 0;

  private readonly onTouchStart = (e: TouchEvent): void => {
    e.preventDefault();
    if (e.touches.length === 1) {
      this.pointerDown = true;
      this.lastTouchX = e.touches[0]!.clientX;
      this.lastTouchY = e.touches[0]!.clientY;
    } else if (e.touches.length === 2) {
      this.lastTouchDist = this.touchDist(e.touches[0]!, e.touches[1]!);
    }
  };

  private readonly onTouchMove = (e: TouchEvent): void => {
    e.preventDefault();
    if (e.touches.length === 1 && this.pointerDown) {
      const t = e.touches[0]!;
      this.arcball.handleMouseDrag(t.clientX - this.lastTouchX, t.clientY - this.lastTouchY);
      this.lastTouchX = t.clientX;
      this.lastTouchY = t.clientY;
      this.updateMatrices();
      this.engine.requestRender();
    } else if (e.touches.length === 2) {
      const dist = this.touchDist(e.touches[0]!, e.touches[1]!);
      this.arcball.handleWheel(-(dist - this.lastTouchDist) * 2);
      this.lastTouchDist = dist;
      this.updateMatrices();
      this.engine.requestRender();
    }
  };

  private readonly onTouchEnd = (): void => { this.pointerDown = false; };

  private touchDist(a: Touch, b: Touch): number {
    return Math.sqrt((a.clientX - b.clientX) ** 2 + (a.clientY - b.clientY) ** 2);
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private updateMatrices(): void {
    const vp = this.engine.viewport;
    const aspect = vp.height > 0 ? vp.width / vp.height : 1;
    this.layer.viewMatrix = this.arcball.getViewMatrix();
    this.layer.projMatrix = mat4Perspective(Math.PI / 4, aspect, 0.001, 10000);
  }

  private computeBBox(data: Scatter3DData): { min: [number, number, number]; max: [number, number, number] } {
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (let i = 0; i < data.x.length; i++) {
      const x = data.x[i]!, y = data.y[i]!, z = this._flatten ? 0 : data.z[i]!;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    }
    if (!isFinite(minX)) { minX = 0; maxX = 1; }
    if (!isFinite(minY)) { minY = 0; maxY = 1; }
    if (!isFinite(minZ)) { minZ = 0; maxZ = 1; }
    return { min: [minX, minY, minZ], max: [maxX, maxY, maxZ] };
  }

  override destroy(): void {
    this.cellLegend?.destroy();
    this.toolbar3D.destroy();
    this.detachInteraction();
    super.destroy();
  }
}
