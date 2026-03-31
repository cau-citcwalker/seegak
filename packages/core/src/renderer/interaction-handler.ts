import type { Vec2, InteractionEvent, Camera } from '../types.js';
import { screenToWorld } from '../utils/math.js';
import type { RenderEngine } from './render-engine.js';

export type InteractionCallback = (event: InteractionEvent) => void;

export class InteractionHandler {
  private callbacks: InteractionCallback[] = [];
  private isDragging = false;
  private lastMouse: Vec2 = { x: 0, y: 0 };
  private isPanning = false;
  private _outsideDrag = false;

  constructor(private engine: RenderEngine) {
    const canvas = engine.gl.canvas as HTMLCanvasElement;

    canvas.addEventListener('mousedown', this.onMouseDown);
    canvas.addEventListener('mousemove', this.onMouseMove);
    canvas.addEventListener('mouseup', this.onMouseUp);
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
    canvas.addEventListener('contextmenu', e => e.preventDefault());

    // Touch support
    canvas.addEventListener('touchstart', this.onTouchStart, { passive: false });
    canvas.addEventListener('touchmove', this.onTouchMove, { passive: false });
    canvas.addEventListener('touchend', this.onTouchEnd);
  }

  /** Allow drag to continue when cursor leaves the canvas */
  set outsideDrag(v: boolean) { this._outsideDrag = v; }
  get outsideDrag(): boolean { return this._outsideDrag; }

  onInteraction(cb: InteractionCallback): () => void {
    this.callbacks.push(cb);
    return () => {
      const idx = this.callbacks.indexOf(cb);
      if (idx !== -1) this.callbacks.splice(idx, 1);
    };
  }

  private emit(event: InteractionEvent): void {
    for (const cb of this.callbacks) {
      cb(event);
    }
  }

  private screenPos(e: MouseEvent): Vec2 {
    const canvas = this.engine.gl.canvas as HTMLCanvasElement;
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * this.engine.viewport.pixelRatio,
      y: (e.clientY - rect.top) * this.engine.viewport.pixelRatio,
    };
  }

  private toWorldPos(screen: Vec2): Vec2 {
    return screenToWorld(screen, this.engine.viewport, this.engine.camera);
  }

  // ─── Mouse ───

  private onMouseDown = (e: MouseEvent): void => {
    const screen = this.screenPos(e);
    this.lastMouse = screen;

    if (e.button === 0 || e.button === 1) {
      // Left click or middle click = pan
      // (When overlay tools like box-select/lasso are active, the overlay
      //  intercepts left-clicks via pointerEvents:auto before they reach here.
      //  In pan mode the overlay has pointerEvents:none so events fall through.)
      this.isPanning = true;
    }

    if (this._outsideDrag) {
      window.addEventListener('mousemove', this.onMouseMove);
      window.addEventListener('mouseup', this.onMouseUp);
    }
  };

  private onMouseMove = (e: MouseEvent): void => {
    const screen = this.screenPos(e);
    const world = this.toWorldPos(screen);

    if (this.isPanning) {
      const dx = (screen.x - this.lastMouse.x) / this.engine.viewport.width * 2 / this.engine.camera.zoom;
      const dy = (screen.y - this.lastMouse.y) / this.engine.viewport.height * 2 / this.engine.camera.zoom;
      this.engine.camera.center.x -= dx;
      this.engine.camera.center.y += dy; // Y is flipped in screen space
      this.engine.requestRender();
      this.emit({ type: 'pan', delta: { x: -dx, y: dy } });
    } else if (this.isDragging) {
      const dx = screen.x - this.lastMouse.x;
      const dy = screen.y - this.lastMouse.y;
      this.emit({
        type: 'drag',
        delta: this.toWorldPos(screen),
        screenDelta: { x: dx, y: dy },
      });
    } else {
      this.emit({ type: 'hover', position: world, screenPosition: screen });
    }

    this.lastMouse = screen;
  };

  private onMouseUp = (e: MouseEvent): void => {
    const screen = this.screenPos(e);

    if (!this.isDragging && !this.isPanning) return;

    if (!this.isPanning && this.isDragging) {
      const world = this.toWorldPos(screen);
      this.emit({ type: 'click', position: world, screenPosition: screen });
    }

    this.isDragging = false;
    this.isPanning = false;

    if (this._outsideDrag) {
      window.removeEventListener('mousemove', this.onMouseMove);
      window.removeEventListener('mouseup', this.onMouseUp);
    }
  };

  // Inertia zoom state
  private targetZoom = 1;
  private zoomAnimId = 0;
  private zoomInertia = true;

  /** Enable/disable smooth inertia zoom (macOS trackpad friendly). Default: true */
  set smoothZoom(v: boolean) { this.zoomInertia = v; }
  get smoothZoom(): boolean { return this.zoomInertia; }

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    const screen = this.screenPos(e);
    const world = this.toWorldPos(screen);

    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    // Sync target with current zoom in case it was changed externally (e.g. autoFit)
    if (!this.zoomAnimId) this.targetZoom = this.engine.camera.zoom;
    this.targetZoom = Math.max(0.01, Math.min(1000, this.targetZoom * factor));

    if (this.zoomInertia) {
      if (!this.zoomAnimId) this.animateZoom();
    } else {
      this.engine.camera.zoom = this.targetZoom;
      this.engine.requestRender();
    }

    this.emit({ type: 'zoom', center: world, factor });
  };

  private animateZoom = (): void => {
    const cam = this.engine.camera;
    const diff = this.targetZoom - cam.zoom;

    if (Math.abs(diff) < 0.001) {
      cam.zoom = this.targetZoom;
      this.engine.requestRender();
      this.zoomAnimId = 0;
      return;
    }

    // Lerp 20% per frame → smooth deceleration
    cam.zoom += diff * 0.2;
    this.engine.requestRender();
    this.zoomAnimId = requestAnimationFrame(this.animateZoom);
  };

  // ─── Touch ───

  private lastTouchDist = 0;

  private onTouchStart = (e: TouchEvent): void => {
    e.preventDefault();
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      this.lastMouse = { x: touch.clientX, y: touch.clientY };
      this.isPanning = true;
    } else if (e.touches.length === 2) {
      this.lastTouchDist = this.touchDistance(e.touches[0], e.touches[1]);
    }
  };

  private onTouchMove = (e: TouchEvent): void => {
    e.preventDefault();
    if (e.touches.length === 1 && this.isPanning) {
      const touch = e.touches[0];
      const dx = (touch.clientX - this.lastMouse.x) / this.engine.viewport.width * 2 / this.engine.camera.zoom;
      const dy = (touch.clientY - this.lastMouse.y) / this.engine.viewport.height * 2 / this.engine.camera.zoom;
      this.engine.camera.center.x -= dx;
      this.engine.camera.center.y += dy;
      this.lastMouse = { x: touch.clientX, y: touch.clientY };
      this.engine.requestRender();
    } else if (e.touches.length === 2) {
      const dist = this.touchDistance(e.touches[0], e.touches[1]);
      const factor = dist / this.lastTouchDist;
      this.engine.camera.zoom *= factor;
      this.engine.camera.zoom = Math.max(0.01, Math.min(1000, this.engine.camera.zoom));
      this.lastTouchDist = dist;
      this.engine.requestRender();
    }
  };

  private onTouchEnd = (): void => {
    this.isPanning = false;
  };

  private touchDistance(a: Touch, b: Touch): number {
    const dx = a.clientX - b.clientX;
    const dy = a.clientY - b.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  destroy(): void {
    const canvas = this.engine.gl.canvas as HTMLCanvasElement;
    canvas.removeEventListener('mousedown', this.onMouseDown);
    canvas.removeEventListener('mousemove', this.onMouseMove);
    canvas.removeEventListener('mouseup', this.onMouseUp);
    canvas.removeEventListener('wheel', this.onWheel);
    canvas.removeEventListener('touchstart', this.onTouchStart);
    canvas.removeEventListener('touchmove', this.onTouchMove);
    canvas.removeEventListener('touchend', this.onTouchEnd);
    // Clean up window listeners if outsideDrag was active
    window.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('mouseup', this.onMouseUp);
    if (this.zoomAnimId) cancelAnimationFrame(this.zoomAnimId);
    this.callbacks = [];
  }
}
