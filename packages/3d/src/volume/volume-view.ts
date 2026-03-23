import { BaseChart } from '@seegak/bio-charts';
import type { VolumeData, VolumeOptions } from '../types.js';
import { VolumeLayer } from './volume-layer.js';
import { ArcballCamera } from '../math/arcball.js';
import { mat4Perspective } from '../math/mat4.js';

/**
 * 3-D volume viewer.
 *
 * Extends BaseChart for container management, engine lifecycle and text
 * rendering.  Replaces the default 2-D pan/zoom interaction with an arcball
 * camera.
 */
export class VolumeView extends BaseChart {
  private readonly layer: VolumeLayer;
  private readonly arcball: ArcballCamera;

  // Interaction state
  private pointerDown = false;
  private lastX = 0;
  private lastY = 0;

  // Cached aspect ratio
  private aspect = 1;

  constructor(container: HTMLElement, options: VolumeOptions = {}) {
    // Disable the default 2-D toolbar; we expose our own controls
    super(container, {
      ...options,
      toolbar: options.toolbar ?? false,
      interactive: false, // we handle interaction ourselves
    });

    this.arcball = new ArcballCamera();
    this.arcball.setDistance(2.5);
    // Centre the unit cube [0,1]^3
    this.arcball.setTarget([0.5, 0.5, 0.5]);

    this.layer = new VolumeLayer();

    // Apply initial options
    if (options.renderMode)  this.layer.setRenderMode(options.renderMode);
    if (options.isoValue !== undefined) this.layer.setIsoValue(options.isoValue);
    if (options.opacity !== undefined)  this.layer.setOpacity(options.opacity);
    if (options.colorScale) {
      // LUT is built lazily inside the layer when GL is available
      this.layer.setColorScale(options.colorScale, this.engine.gl);
    }

    const cx: [number, number] = options.clipX ?? [0, 1];
    const cy: [number, number] = options.clipY ?? [0, 1];
    const cz: [number, number] = options.clipZ ?? [0, 1];
    this.layer.setClip(cx, cy, cz);

    // Push view/proj matrices from arcball before first render
    this.updateMatrices();

    this.engine.addLayer(this.layer);
    this.attachInteraction();
    this.engine.requestRender();
  }

  // ─── BaseChart abstract method ────────────────────────────────────────────

  /** Convenience alias — calls setData. */
  update(data: VolumeData): void {
    this.setData(data);
  }

  // ─── Public API ───────────────────────────────────────────────────────────

  setData(data: VolumeData): void {
    this.layer.setData(data, this.engine.gl);
    this.engine.requestRender();
  }

  setRenderMode(mode: NonNullable<VolumeOptions['renderMode']>): void {
    this.layer.setRenderMode(mode);
    this.engine.requestRender();
  }

  setIsoValue(v: number): void {
    this.layer.setIsoValue(v);
    this.engine.requestRender();
  }

  setColorScale(name: NonNullable<VolumeOptions['colorScale']>): void {
    this.layer.setColorScale(name, this.engine.gl);
    this.engine.requestRender();
  }

  setClip(
    x: [number, number],
    y: [number, number],
    z: [number, number],
  ): void {
    this.layer.setClip(x, y, z);
    this.engine.requestRender();
  }

  setOpacity(v: number): void {
    this.layer.setOpacity(v);
    this.engine.requestRender();
  }

  // ─── Camera ───────────────────────────────────────────────────────────────

  override resetCamera(): void {
    this.arcball.reset();
    this.arcball.setDistance(2.5);
    this.arcball.setTarget([0.5, 0.5, 0.5]);
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

    // Touch
    canvas.addEventListener('touchstart', this.onTouchStart, { passive: false });
    canvas.addEventListener('touchmove',  this.onTouchMove,  { passive: false });
    canvas.addEventListener('touchend',   this.onTouchEnd);

    // Make canvas focusable so it receives keyboard events
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

  private lastTouchX = 0;
  private lastTouchY = 0;
  private lastTouchDist = 0;

  private readonly onTouchStart = (e: TouchEvent): void => {
    e.preventDefault();
    if (e.touches.length === 1) {
      const t = e.touches[0]!;
      this.pointerDown = true;
      this.lastTouchX = t.clientX;
      this.lastTouchY = t.clientY;
    } else if (e.touches.length === 2) {
      this.lastTouchDist = this.touchDist(e.touches[0]!, e.touches[1]!);
    }
  };

  private readonly onTouchMove = (e: TouchEvent): void => {
    e.preventDefault();
    if (e.touches.length === 1 && this.pointerDown) {
      const t = e.touches[0]!;
      const dx = t.clientX - this.lastTouchX;
      const dy = t.clientY - this.lastTouchY;
      this.lastTouchX = t.clientX;
      this.lastTouchY = t.clientY;
      this.arcball.handleMouseDrag(dx, dy);
      this.updateMatrices();
      this.engine.requestRender();
    } else if (e.touches.length === 2) {
      const dist = this.touchDist(e.touches[0]!, e.touches[1]!);
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

  // ─── Matrix helpers ───────────────────────────────────────────────────────

  private updateMatrices(): void {
    const vp = this.engine.viewport;
    this.aspect = vp.height > 0 ? vp.width / vp.height : 1;

    this.layer.viewMatrix = this.arcball.getViewMatrix();
    this.layer.projMatrix = mat4Perspective(
      Math.PI / 4,   // 45° FOV
      this.aspect,
      0.01,
      100,
    );
  }

  // ─── Lifecycle ────────────────────────────────────────────────────────────

  override destroy(): void {
    this.detachInteraction();
    super.destroy();
  }
}
