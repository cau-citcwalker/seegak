import type { Vec2, Vec4 } from '../types.js';

interface TextEntry {
  text: string;
  position: Vec2;
  color: Vec4;
  fontSize: number;
  align: CanvasTextAlign;
  baseline: CanvasTextBaseline;
  rotation?: number;
}

/**
 * Canvas 2D overlay for text rendering.
 * WebGL is bad at text — we use a 2D canvas layered on top.
 */
export class TextRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private queue: TextEntry[] = [];
  private fontFamily = 'system-ui, -apple-system, sans-serif';

  constructor(container: HTMLElement) {
    this.canvas = document.createElement('canvas');
    this.canvas.style.position = 'absolute';
    this.canvas.style.top = '0';
    this.canvas.style.left = '0';
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.canvas.style.pointerEvents = 'none'; // clicks pass through to WebGL canvas
    container.appendChild(this.canvas);

    this.ctx = this.canvas.getContext('2d')!;
  }

  resize(width: number, height: number): void {
    this.canvas.width = width;
    this.canvas.height = height;
  }

  setFont(family: string): void {
    this.fontFamily = family;
  }

  /** Queue text for rendering (call flush() to draw) */
  add(
    text: string,
    x: number, y: number,
    options?: {
      color?: Vec4;
      fontSize?: number;
      align?: CanvasTextAlign;
      baseline?: CanvasTextBaseline;
      rotation?: number;
    },
  ): void {
    this.queue.push({
      text,
      position: { x, y },
      color: options?.color ?? { r: 1, g: 1, b: 1, a: 1 },
      fontSize: options?.fontSize ?? 12,
      align: options?.align ?? 'left',
      baseline: options?.baseline ?? 'top',
      rotation: options?.rotation,
    });
  }

  /** Draw all queued text and clear the queue */
  flush(): void {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    for (const entry of this.queue) {
      ctx.save();

      const { r, g, b, a } = entry.color;
      ctx.fillStyle = `rgba(${r * 255},${g * 255},${b * 255},${a})`;
      ctx.font = `${entry.fontSize}px ${this.fontFamily}`;
      ctx.textAlign = entry.align;
      ctx.textBaseline = entry.baseline;

      if (entry.rotation) {
        ctx.translate(entry.position.x, entry.position.y);
        ctx.rotate(entry.rotation);
        ctx.fillText(entry.text, 0, 0);
      } else {
        ctx.fillText(entry.text, entry.position.x, entry.position.y);
      }

      ctx.restore();
    }

    this.queue = [];
  }

  /** Access the underlying 2D context for custom drawing (e.g. grid lines) */
  get context(): CanvasRenderingContext2D { return this.ctx; }

  /** Measure text width in pixels */
  measure(text: string, fontSize: number): number {
    this.ctx.font = `${fontSize}px ${this.fontFamily}`;
    return this.ctx.measureText(text).width;
  }

  clear(): void {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.queue = [];
  }

  destroy(): void {
    this.canvas.remove();
  }
}
