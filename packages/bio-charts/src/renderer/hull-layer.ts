/**
 * Render convex hull polygons for each cluster as transparent filled areas
 * with colored borders, using the 2D canvas overlay (not WebGL).
 */

export interface HullData {
  /** label → hull vertices as [x0,y0, x1,y1, ...] in world space */
  hulls: Map<string, Float32Array>;
  /** label → hex color */
  colors: Map<string, string>;
}

export class HullOverlay {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private data: HullData | null = null;
  private visible = false;

  private worldToScreen: ((wx: number, wy: number) => [number, number]) | null = null;
  private rafId = 0;

  constructor(container: HTMLElement) {
    this.canvas = document.createElement('canvas');
    this.canvas.style.cssText = [
      'position:absolute',
      'top:0',
      'left:0',
      'width:100%',
      'height:100%',
      'pointer-events:none',
      'z-index:2',
    ].join(';');
    container.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d')!;
  }

  setData(data: HullData): void {
    this.data = data;
    if (this.visible) this.redraw();
  }

  setTransform(fn: (wx: number, wy: number) => [number, number]): void {
    this.worldToScreen = fn;
  }

  show(): void {
    this.visible = true;
    this.canvas.style.display = 'block';
    this.startLoop();
    this.redraw();
  }

  hide(): void {
    this.visible = false;
    this.canvas.style.display = 'none';
    cancelAnimationFrame(this.rafId);
  }

  toggle(): boolean {
    if (this.visible) this.hide();
    else this.show();
    return this.visible;
  }

  resize(w: number, h: number): void {
    this.canvas.width = w;
    this.canvas.height = h;
    if (this.visible) this.redraw();
  }

  private startLoop(): void {
    let lastZoom = -1, lastCx = -1, lastCy = -1;
    const loop = () => {
      if (!this.visible) return;
      // Detect camera changes by checking if transform output changed
      // Simple poll approach
      this.redraw();
      this.rafId = requestAnimationFrame(loop);
    };
    // Throttle to ~20fps for hull redraw (no need for 60fps)
    const throttled = () => {
      if (!this.visible) return;
      this.redraw();
      setTimeout(() => { this.rafId = requestAnimationFrame(throttled); }, 50);
    };
    this.rafId = requestAnimationFrame(throttled);
  }

  private redraw(): void {
    const { width, height } = this.canvas;
    if (width === 0 || height === 0 || !this.data || !this.worldToScreen) return;

    const ctx = this.ctx;
    const pr = window.devicePixelRatio || 1;

    // Sync canvas buffer size with CSS size
    const cssW = this.canvas.clientWidth;
    const cssH = this.canvas.clientHeight;
    if (this.canvas.width !== cssW * pr || this.canvas.height !== cssH * pr) {
      this.canvas.width = cssW * pr;
      this.canvas.height = cssH * pr;
    }

    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.save();
    ctx.scale(pr, pr);

    for (const [label, hull] of this.data.hulls) {
      if (hull.length < 6) continue; // need at least 3 points
      const color = this.data.colors.get(label) ?? '#888';

      ctx.beginPath();
      const [sx0, sy0] = this.worldToScreen(hull[0]!, hull[1]!);
      ctx.moveTo(sx0, sy0);
      for (let i = 2; i < hull.length; i += 2) {
        const [sx, sy] = this.worldToScreen(hull[i]!, hull[i + 1]!);
        ctx.lineTo(sx, sy);
      }
      ctx.closePath();

      // Fill with transparent color
      ctx.fillStyle = color + '18'; // ~10% opacity
      ctx.fill();

      // Border
      ctx.strokeStyle = color + '60'; // ~38% opacity
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    ctx.restore();
  }

  destroy(): void {
    cancelAnimationFrame(this.rafId);
    this.canvas.remove();
  }
}
