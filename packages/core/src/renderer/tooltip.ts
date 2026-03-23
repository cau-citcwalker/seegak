/**
 * Tooltip renderer — DOM-based overlay for hover information.
 * Positioned relative to the chart container.
 */

export interface TooltipRow {
  label: string;
  value: string | number;
  color?: string;
}

export interface TooltipContent {
  title?: string;
  rows: TooltipRow[];
}

export interface TooltipOptions {
  /** Pixel offset from cursor */
  offsetX?: number;
  offsetY?: number;
  /** Delay before showing (ms) */
  showDelay?: number;
  /** Max width in pixels */
  maxWidth?: number;
}

export class Tooltip {
  private el: HTMLDivElement;
  private container: HTMLElement;
  private visible = false;
  private showTimer = 0;
  private opts: Required<TooltipOptions>;

  constructor(container: HTMLElement, options: TooltipOptions = {}) {
    this.container = container;
    this.opts = {
      offsetX: options.offsetX ?? 14,
      offsetY: options.offsetY ?? -10,
      showDelay: options.showDelay ?? 20,
      maxWidth: options.maxWidth ?? 260,
    };

    this.el = document.createElement('div');
    Object.assign(this.el.style, {
      position: 'absolute',
      display: 'none',
      pointerEvents: 'none',
      zIndex: '200',
      backgroundColor: 'rgba(15, 20, 30, 0.92)',
      color: '#e8e8e8',
      borderRadius: '6px',
      padding: '8px 12px',
      fontSize: '12px',
      lineHeight: '1.6',
      boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
      border: '1px solid rgba(255,255,255,0.08)',
      maxWidth: `${this.opts.maxWidth}px`,
      whiteSpace: 'nowrap',
      transition: 'opacity 0.1s ease',
      opacity: '0',
    });

    container.style.position = 'relative';
    container.appendChild(this.el);
  }

  /** Show tooltip at the given screen position with content */
  show(screenX: number, screenY: number, content: TooltipContent): void {
    clearTimeout(this.showTimer);

    this.showTimer = window.setTimeout(() => {
      this.el.innerHTML = this.buildHTML(content);
      this.el.style.display = 'block';

      // Position — flip if too close to right/bottom edge
      const containerRect = this.container.getBoundingClientRect();
      const tooltipW = this.el.offsetWidth;
      const tooltipH = this.el.offsetHeight;

      let x = screenX + this.opts.offsetX;
      let y = screenY + this.opts.offsetY;

      if (x + tooltipW > containerRect.width - 10) {
        x = screenX - tooltipW - this.opts.offsetX;
      }
      if (y + tooltipH > containerRect.height - 10) {
        y = screenY - tooltipH - Math.abs(this.opts.offsetY);
      }
      if (y < 5) y = 5;
      if (x < 5) x = 5;

      this.el.style.left = `${x}px`;
      this.el.style.top = `${y}px`;
      this.el.style.opacity = '1';
      this.visible = true;
    }, this.opts.showDelay);
  }

  /** Update position without re-rendering content */
  move(screenX: number, screenY: number): void {
    if (!this.visible) return;

    const containerRect = this.container.getBoundingClientRect();
    const tooltipW = this.el.offsetWidth;
    const tooltipH = this.el.offsetHeight;

    let x = screenX + this.opts.offsetX;
    let y = screenY + this.opts.offsetY;

    if (x + tooltipW > containerRect.width - 10) x = screenX - tooltipW - this.opts.offsetX;
    if (y + tooltipH > containerRect.height - 10) y = screenY - tooltipH - Math.abs(this.opts.offsetY);
    if (y < 5) y = 5;
    if (x < 5) x = 5;

    this.el.style.left = `${x}px`;
    this.el.style.top = `${y}px`;
  }

  hide(): void {
    clearTimeout(this.showTimer);
    this.el.style.opacity = '0';
    // Wait for fade-out transition before hiding
    setTimeout(() => {
      if (!this.visible) {
        this.el.style.display = 'none';
      }
    }, 100);
    this.visible = false;
  }

  private buildHTML(content: TooltipContent): string {
    let html = '';

    if (content.title) {
      html += `<div style="font-weight:600;margin-bottom:5px;color:#fff;border-bottom:1px solid rgba(255,255,255,0.12);padding-bottom:4px">${content.title}</div>`;
    }

    for (const row of content.rows) {
      const swatch = row.color
        ? `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${row.color};margin-right:5px;vertical-align:middle"></span>`
        : '';
      html += `<div style="display:flex;justify-content:space-between;gap:12px">
        <span style="color:#aaa">${swatch}${row.label}</span>
        <span style="color:#fff;font-variant-numeric:tabular-nums">${row.value}</span>
      </div>`;
    }

    return html;
  }

  isVisible(): boolean {
    return this.visible;
  }

  destroy(): void {
    clearTimeout(this.showTimer);
    this.el.remove();
  }
}

// ─── Throttle helper ───

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function throttle<T extends (...args: any[]) => void>(
  fn: T,
  intervalMs: number,
): T {
  let lastCall = 0;
  let timer = 0;

  return ((...args: Parameters<T>) => {
    const now = performance.now();
    const remaining = intervalMs - (now - lastCall);

    if (remaining <= 0) {
      clearTimeout(timer);
      lastCall = now;
      fn(...args);
    } else {
      clearTimeout(timer);
      timer = window.setTimeout(() => {
        lastCall = performance.now();
        fn(...args);
      }, remaining);
    }
  }) as T;
}
