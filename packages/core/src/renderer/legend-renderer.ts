/**
 * Legend renderer — draws chart legends and color bars.
 * Uses DOM elements overlaid on the canvas for crisp text.
 */

import type { Vec4, ColorScale } from '../types.js';
import { vec4ToHex } from '../utils/math.js';
import { sampleColorScale } from '../utils/color-scales.js';

export interface LegendItem {
  label: string;
  color: Vec4;
  /** If true, show as an outlined shape instead of filled */
  outline?: boolean;
}

export interface LegendOptions {
  /** Position relative to chart container */
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  /** Maximum height before scrolling */
  maxHeight?: number;
  /** Item click handler */
  onItemClick?: (index: number, item: LegendItem) => void;
}

export interface ColorBarOptions {
  /** Position: 'right' (default) or 'left' */
  position?: 'right' | 'left';
  /** Width of the color bar in pixels */
  width?: number;
  /** Height of the color bar in pixels */
  height?: number;
  /** Label at the top (max value) */
  maxLabel?: string;
  /** Label at the bottom (min value) */
  minLabel?: string;
  /** Title for the color bar */
  title?: string;
}

// ─── Categorical Legend ───

export class LegendRenderer {
  private container: HTMLDivElement;
  private items: LegendItem[] = [];
  private opts: Required<Pick<LegendOptions, 'position' | 'maxHeight'>>;
  private onItemClick?: (index: number, item: LegendItem) => void;

  constructor(parent: HTMLElement, options: LegendOptions = {}) {
    this.opts = {
      position: options.position ?? 'top-right',
      maxHeight: options.maxHeight ?? 300,
    };
    this.onItemClick = options.onItemClick;

    this.container = document.createElement('div');
    this.applyStyles();
    parent.appendChild(this.container);
  }

  private applyStyles(): void {
    const pos = this.opts.position;
    Object.assign(this.container.style, {
      position: 'absolute',
      display: 'none',
      backgroundColor: 'rgba(0, 0, 0, 0.75)',
      borderRadius: '6px',
      padding: '8px',
      fontSize: '12px',
      color: '#ddd',
      maxHeight: `${this.opts.maxHeight}px`,
      overflowY: 'auto',
      zIndex: '100',
      pointerEvents: 'auto',
      ...(pos.includes('top') ? { top: '10px' } : { bottom: '10px' }),
      ...(pos.includes('right') ? { right: '10px' } : { left: '10px' }),
    });
  }

  update(items: LegendItem[]): void {
    this.items = items;
    this.container.innerHTML = '';

    if (items.length === 0) {
      this.container.style.display = 'none';
      return;
    }

    this.container.style.display = 'block';

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const row = document.createElement('div');
      Object.assign(row.style, {
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        padding: '2px 4px',
        cursor: this.onItemClick ? 'pointer' : 'default',
        borderRadius: '3px',
      });

      row.addEventListener('mouseenter', () => {
        row.style.backgroundColor = 'rgba(255,255,255,0.1)';
      });
      row.addEventListener('mouseleave', () => {
        row.style.backgroundColor = 'transparent';
      });

      if (this.onItemClick) {
        row.addEventListener('click', () => this.onItemClick!(i, item));
      }

      // Color swatch
      const swatch = document.createElement('span');
      const hex = vec4ToHex(item.color);
      Object.assign(swatch.style, {
        display: 'inline-block',
        width: '12px',
        height: '12px',
        borderRadius: item.outline ? '2px' : '50%',
        backgroundColor: item.outline ? 'transparent' : hex,
        border: item.outline ? `2px solid ${hex}` : 'none',
        flexShrink: '0',
      });

      // Label
      const label = document.createElement('span');
      label.textContent = item.label;
      label.style.whiteSpace = 'nowrap';

      row.appendChild(swatch);
      row.appendChild(label);
      this.container.appendChild(row);
    }
  }

  show(): void {
    this.container.style.display = 'block';
  }

  hide(): void {
    this.container.style.display = 'none';
  }

  destroy(): void {
    this.container.remove();
  }
}

// ─── Color Bar (for continuous scales) ───

export class ColorBarRenderer {
  private container: HTMLDivElement;
  private canvas: HTMLCanvasElement;
  private opts: Required<Pick<ColorBarOptions, 'position' | 'width' | 'height'>>;

  constructor(parent: HTMLElement, options: ColorBarOptions = {}) {
    this.opts = {
      position: options.position ?? 'right',
      width: options.width ?? 20,
      height: options.height ?? 200,
    };

    this.container = document.createElement('div');
    Object.assign(this.container.style, {
      position: 'absolute',
      display: 'none',
      [this.opts.position === 'right' ? 'right' : 'left']: '40px',
      top: '50%',
      transform: 'translateY(-50%)',
      textAlign: 'center',
      zIndex: '100',
    });

    this.canvas = document.createElement('canvas');
    this.canvas.width = this.opts.width;
    this.canvas.height = this.opts.height;
    Object.assign(this.canvas.style, {
      borderRadius: '3px',
      border: '1px solid rgba(255,255,255,0.2)',
    });

    this.container.appendChild(this.canvas);
    parent.appendChild(this.container);
  }

  update(scale: ColorScale, minLabel: string, maxLabel: string, title?: string): void {
    this.container.style.display = 'block';
    this.container.innerHTML = '';

    // Title
    if (title) {
      const titleEl = document.createElement('div');
      titleEl.textContent = title;
      Object.assign(titleEl.style, {
        color: '#ddd', fontSize: '11px', marginBottom: '4px',
      });
      this.container.appendChild(titleEl);
    }

    // Max label
    const maxEl = document.createElement('div');
    maxEl.textContent = maxLabel;
    Object.assign(maxEl.style, {
      color: '#ccc', fontSize: '10px', marginBottom: '2px',
    });
    this.container.appendChild(maxEl);

    // Canvas gradient
    this.container.appendChild(this.canvas);
    const ctx = this.canvas.getContext('2d')!;
    const h = this.opts.height;
    const w = this.opts.width;

    for (let y = 0; y < h; y++) {
      const t = 1 - y / (h - 1); // top = max, bottom = min
      const color = sampleColorScale(scale, t);
      ctx.fillStyle = `rgba(${color.r * 255},${color.g * 255},${color.b * 255},${color.a})`;
      ctx.fillRect(0, y, w, 1);
    }

    // Min label
    const minEl = document.createElement('div');
    minEl.textContent = minLabel;
    Object.assign(minEl.style, {
      color: '#ccc', fontSize: '10px', marginTop: '2px',
    });
    this.container.appendChild(minEl);
  }

  hide(): void {
    this.container.style.display = 'none';
  }

  destroy(): void {
    this.container.remove();
  }
}
