import { BaseChart } from '@seegak/bio-charts';
import type { MeshData, MeshOptions } from '../types.js';
import { MeshLayer } from './mesh-layer.js';
import { ArcballCamera } from '../math/arcball.js';
import { mat4Perspective } from '../math/mat4.js';

/**
 * 3-D mesh viewer.
 *
 * Extends BaseChart for container/engine management and replaces the 2-D
 * pan/zoom interaction with an arcball camera.  Supports wireframe, Phong
 * lighting, per-vertex colours, and arbitrary mesh data.
 */
export class MeshView extends BaseChart {
  private readonly layer: MeshLayer;
  private readonly arcball: ArcballCamera;

  // Interaction state
  private pointerDown = false;
  private lastX = 0;
  private lastY = 0;

  constructor(container: HTMLElement, options: MeshOptions = {}) {
    super(container, {
      ...options,
      toolbar:     options.toolbar ?? false,
      interactive: false,
    });

    this.arcball = new ArcballCamera();
    this.layer   = new MeshLayer();

    // Apply initial options
    if (options.wireframe !== undefined) this.layer.setWireframe(options.wireframe);
    if (options.lighting  !== undefined) this.layer.setLighting(options.lighting);
    if (options.opacity   !== undefined) this.layer.setOpacity(options.opacity);
    if (options.color)                   this.layer.setColor(options.color);

    this.updateMatrices();
    this.engine.addLayer(this.layer);
    this.attachInteraction();
    this.engine.requestRender();
  }

  // ─── BaseChart abstract method ────────────────────────────────────────────

  update(data: MeshData): void {
    this.setData(data);
  }

  // ─── Public API ───────────────────────────────────────────────────────────

  setData(data: MeshData): void {
    this.layer.setData(data, this.engine.gl);
    // Auto-fit camera distance based on bounding box diagonal
    const bbox = this.boundingBox(data.vertices);
    const diag = Math.sqrt(
      (bbox.max[0] - bbox.min[0]) ** 2 +
      (bbox.max[1] - bbox.min[1]) ** 2 +
      (bbox.max[2] - bbox.min[2]) ** 2,
    );
    const cx = (bbox.min[0] + bbox.max[0]) / 2;
    const cy = (bbox.min[1] + bbox.max[1]) / 2;
    const cz = (bbox.min[2] + bbox.max[2]) / 2;
    this.arcball.setTarget([cx, cy, cz]);
    this.arcball.setDistance(diag * 1.5);
    this.updateMatrices();
    this.engine.requestRender();
  }

  setWireframe(v: boolean): void {
    this.layer.setWireframe(v);
    this.engine.requestRender();
  }

  setLighting(v: boolean): void {
    this.layer.setLighting(v);
    this.engine.requestRender();
  }

  setColor(color: string): void {
    this.layer.setColor(color);
    this.engine.requestRender();
  }

  setOpacity(v: number): void {
    this.layer.setOpacity(v);
    this.engine.requestRender();
  }

  override resetCamera(): void {
    this.arcball.reset();
    this.updateMatrices();
    this.engine.requestRender();
  }

  // ─── Interaction ──────────────────────────────────────────────────────────

  private attachInteraction(): void {
    const canvas = this.engine.gl.canvas as HTMLCanvasElement;

    canvas.addEventListener('mousedown',  this.onMouseDown);
    canvas.addEventListener('mousemove',  this.onMouseMove);
    canvas.addEventListener('mouseup',    this.onMouseUp);
    canvas.addEventListener('mouseleave', this.onMouseUp);
    canvas.addEventListener('wheel',      this.onWheel, { passive: false });
    canvas.addEventListener('keydown',    this.onKeyDown);

    canvas.addEventListener('touchstart', this.onTouchStart, { passive: false });
    canvas.addEventListener('touchmove',  this.onTouchMove,  { passive: false });
    canvas.addEventListener('touchend',   this.onTouchEnd);

    canvas.tabIndex = 0;
  }

  private detachInteraction(): void {
    const canvas = this.engine.gl.canvas as HTMLCanvasElement;
    canvas.removeEventListener('mousedown',  this.onMouseDown);
    canvas.removeEventListener('mousemove',  this.onMouseMove);
    canvas.removeEventListener('mouseup',    this.onMouseUp);
    canvas.removeEventListener('mouseleave', this.onMouseUp);
    canvas.removeEventListener('wheel',      this.onWheel);
    canvas.removeEventListener('keydown',    this.onKeyDown);
    canvas.removeEventListener('touchstart', this.onTouchStart);
    canvas.removeEventListener('touchmove',  this.onTouchMove);
    canvas.removeEventListener('touchend',   this.onTouchEnd);
  }

  private readonly onMouseDown = (e: MouseEvent): void => {
    this.pointerDown = true;
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
    this.arcball.handleMouseDrag(dx, dy);
    this.updateMatrices();
    this.engine.requestRender();
  };

  private readonly onMouseUp = (): void => {
    this.pointerDown = false;
  };

  private readonly onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    this.arcball.handleWheel(e.deltaY);
    this.updateMatrices();
    this.engine.requestRender();
  };

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'r' || e.key === 'R') {
      this.resetCamera();
    }
  };

  // ─── Touch ───────────────────────────────────────────────────────────────

  private lastTouchX    = 0;
  private lastTouchY    = 0;
  private lastTouchDist = 0;

  private readonly onTouchStart = (e: TouchEvent): void => {
    e.preventDefault();
    if (e.touches.length === 1) {
      const t = e.touches[0]!;
      this.pointerDown = true;
      this.lastTouchX  = t.clientX;
      this.lastTouchY  = t.clientY;
    } else if (e.touches.length === 2) {
      this.lastTouchDist = this.touchDist(e.touches[0]!, e.touches[1]!);
    }
  };

  private readonly onTouchMove = (e: TouchEvent): void => {
    e.preventDefault();
    if (e.touches.length === 1 && this.pointerDown) {
      const t  = e.touches[0]!;
      const dx = t.clientX - this.lastTouchX;
      const dy = t.clientY - this.lastTouchY;
      this.lastTouchX = t.clientX;
      this.lastTouchY = t.clientY;
      this.arcball.handleMouseDrag(dx, dy);
      this.updateMatrices();
      this.engine.requestRender();
    } else if (e.touches.length === 2) {
      const dist  = this.touchDist(e.touches[0]!, e.touches[1]!);
      const delta = dist - this.lastTouchDist;
      this.arcball.handleWheel(-delta * 2);
      this.lastTouchDist = dist;
      this.updateMatrices();
      this.engine.requestRender();
    }
  };

  private readonly onTouchEnd = (): void => {
    this.pointerDown = false;
  };

  private touchDist(a: Touch, b: Touch): number {
    const dx = a.clientX - b.clientX;
    const dy = a.clientY - b.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  private updateMatrices(): void {
    const vp     = this.engine.viewport;
    const aspect = vp.height > 0 ? vp.width / vp.height : 1;

    this.layer.viewMatrix = this.arcball.getViewMatrix();
    this.layer.projMatrix = mat4Perspective(Math.PI / 4, aspect, 0.001, 10000);
  }

  private boundingBox(vertices: Float32Array): {
    min: [number, number, number];
    max: [number, number, number];
  } {
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

    for (let i = 0; i < vertices.length; i += 3) {
      const x = vertices[i]!;
      const y = vertices[i + 1]!;
      const z = vertices[i + 2]!;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (z < minZ) minZ = z;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
      if (z > maxZ) maxZ = z;
    }

    // If empty vertices fall back to unit cube
    if (!isFinite(minX)) { minX = 0; maxX = 1; }
    if (!isFinite(minY)) { minY = 0; maxY = 1; }
    if (!isFinite(minZ)) { minZ = 0; maxZ = 1; }

    return { min: [minX, minY, minZ], max: [maxX, maxY, maxZ] };
  }

  override destroy(): void {
    this.detachInteraction();
    super.destroy();
  }
}
