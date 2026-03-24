/**
 * Export chart to PNG or SVG.
 */

import type { RenderEngine } from './render-engine.js';
import type { TextRenderer } from './text-renderer.js';

export interface ExportOptions {
  /** Output format */
  format: 'png' | 'svg';
  /** Filename (without extension) */
  filename?: string;
  /** Scale factor for higher resolution PNG */
  scale?: number;
  /** Background color (CSS string). Transparent if not set. */
  backgroundColor?: string;
  /** Image width override (pixels) */
  width?: number;
  /** Image height override (pixels) */
  height?: number;
}

/**
 * Export the WebGL canvas + text overlay to a PNG image.
 */
export async function exportToPNG(
  engine: RenderEngine,
  textRenderer: TextRenderer | null,
  options: ExportOptions = { format: 'png' },
): Promise<Blob> {
  const scale = options.scale ?? 2;
  const gl = engine.gl;
  const srcCanvas = gl.canvas as HTMLCanvasElement;

  const w = options.width ?? srcCanvas.width;
  const h = options.height ?? srcCanvas.height;

  // Create composite canvas
  const composite = document.createElement('canvas');
  composite.width = w * scale;
  composite.height = h * scale;
  const ctx = composite.getContext('2d')!;

  // Background
  if (options.backgroundColor) {
    ctx.fillStyle = options.backgroundColor;
    ctx.fillRect(0, 0, composite.width, composite.height);
  }

  // Force a render with preserveDrawingBuffer-like behavior
  // We need to read before the buffer is cleared
  engine.requestRender();

  // Wait for the render to complete
  await new Promise(resolve => requestAnimationFrame(resolve));

  // Draw WebGL canvas
  ctx.drawImage(srcCanvas, 0, 0, composite.width, composite.height);

  // Overlay text canvas if present
  if (textRenderer) {
    const textCanvas = (textRenderer as unknown as { canvas: HTMLCanvasElement }).canvas;
    if (textCanvas) {
      ctx.drawImage(textCanvas, 0, 0, composite.width, composite.height);
    }
  }

  // Convert to blob
  return new Promise<Blob>((resolve, reject) => {
    composite.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Failed to export PNG'));
      },
      'image/png',
    );
  });
}

/**
 * Export chart as SVG by capturing the canvas as an embedded image
 * plus any text as SVG text elements.
 */
export function exportToSVG(
  engine: RenderEngine,
  textRenderer: TextRenderer | null,
  options: ExportOptions = { format: 'svg' },
): string {
  const gl = engine.gl;
  const srcCanvas = gl.canvas as HTMLCanvasElement;
  const w = options.width ?? srcCanvas.width;
  const h = options.height ?? srcCanvas.height;

  // Get canvas as data URL
  const dataURL = srcCanvas.toDataURL('image/png');

  let svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
     width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
`;

  if (options.backgroundColor) {
    svg += `  <rect width="100%" height="100%" fill="${options.backgroundColor}" />\n`;
  }

  // Embed rasterized chart
  svg += `  <image width="${w}" height="${h}" href="${dataURL}" />\n`;

  // Overlay text canvas as another embedded image
  if (textRenderer) {
    const textCanvas = (textRenderer as unknown as { canvas: HTMLCanvasElement }).canvas;
    if (textCanvas) {
      const textDataURL = textCanvas.toDataURL('image/png');
      svg += `  <image width="${w}" height="${h}" href="${textDataURL}" />\n`;
    }
  }

  svg += '</svg>';
  return svg;
}

/**
 * Trigger a download in the browser.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function downloadSVG(svgString: string, filename: string): void {
  const blob = new Blob([svgString], { type: 'image/svg+xml' });
  downloadBlob(blob, filename);
}

/**
 * High-level export function — handles both formats.
 */
export async function exportChart(
  engine: RenderEngine,
  textRenderer: TextRenderer | null,
  options: ExportOptions,
): Promise<void> {
  const filename = options.filename ?? 'chart';

  if (options.format === 'png') {
    const blob = await exportToPNG(engine, textRenderer, options);
    downloadBlob(blob, `${filename}.png`);
  } else {
    const svg = exportToSVG(engine, textRenderer, options);
    downloadSVG(svg, `${filename}.svg`);
  }
}

// ─── CSV Export ──────────────────────────────────────────────────────────────

export interface CsvColumn {
  header: string;
  values: ArrayLike<number> | string[];
}

/**
 * Export tabular data as a CSV file and trigger download.
 */
export function exportCSV(columns: CsvColumn[], filename: string): void {
  if (columns.length === 0) return;
  const nRows = columns[0]!.values.length;

  const headerLine = columns.map(c => c.header).join(',');
  const lines = [headerLine];

  for (let i = 0; i < nRows; i++) {
    const row = columns.map(col => {
      const v = col.values[i];
      if (typeof v === 'string') {
        // Escape commas/quotes in strings
        return v.includes(',') || v.includes('"') ? `"${v.replace(/"/g, '""')}"` : v;
      }
      return String(v);
    });
    lines.push(row.join(','));
  }

  const csv = lines.join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  downloadBlob(blob, filename);
}
