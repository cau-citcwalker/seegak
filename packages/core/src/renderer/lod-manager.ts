/**
 * Level of Detail manager.
 * Determines how many points to render based on zoom level and viewport.
 */

import type { Camera, Viewport, Rect } from '../types.js';

export interface LODLevel {
  /** Minimum zoom level for this LOD */
  minZoom: number;
  /** Maximum number of points to render */
  maxPoints: number;
  /** Point size multiplier */
  pointSizeScale: number;
}

const DEFAULT_LOD_LEVELS: LODLevel[] = [
  { minZoom: 0,    maxPoints: 5000,    pointSizeScale: 2.0 },
  { minZoom: 0.5,  maxPoints: 20000,   pointSizeScale: 1.5 },
  { minZoom: 1.0,  maxPoints: 50000,   pointSizeScale: 1.0 },
  { minZoom: 2.0,  maxPoints: 200000,  pointSizeScale: 0.8 },
  { minZoom: 5.0,  maxPoints: 500000,  pointSizeScale: 0.6 },
  { minZoom: 10.0, maxPoints: Infinity, pointSizeScale: 0.5 },
];

export class LODManager {
  private levels: LODLevel[];

  constructor(levels?: LODLevel[]) {
    this.levels = levels ?? DEFAULT_LOD_LEVELS;
    // Sort by minZoom ascending
    this.levels.sort((a, b) => a.minZoom - b.minZoom);
  }

  /** Get the current LOD level based on camera zoom */
  getLevel(zoom: number): LODLevel {
    let level = this.levels[0];
    for (const l of this.levels) {
      if (zoom >= l.minZoom) level = l;
      else break;
    }
    return level;
  }

  /** Determine the visible data bounds in world coordinates */
  getVisibleBounds(viewport: Viewport, camera: Camera): Rect {
    const aspect = viewport.width / viewport.height;
    const halfW = aspect / camera.zoom;
    const halfH = 1 / camera.zoom;

    return {
      x: camera.center.x - halfW,
      y: camera.center.y - halfH,
      width: halfW * 2,
      height: halfH * 2,
    };
  }

  /**
   * Filter and downsample data arrays based on current LOD.
   * Returns indices of points to render.
   */
  selectPoints(
    x: Float32Array,
    y: Float32Array,
    viewport: Viewport,
    camera: Camera,
  ): Uint32Array {
    const level = this.getLevel(camera.zoom);
    const bounds = this.getVisibleBounds(viewport, camera);
    const n = x.length;

    // First pass: collect visible indices
    const visible: number[] = [];
    for (let i = 0; i < n; i++) {
      if (
        x[i] >= bounds.x && x[i] <= bounds.x + bounds.width &&
        y[i] >= bounds.y && y[i] <= bounds.y + bounds.height
      ) {
        visible.push(i);
      }
    }

    // If visible count within budget, return all visible
    if (visible.length <= level.maxPoints) {
      return new Uint32Array(visible);
    }

    // Downsample with stride
    const stride = Math.ceil(visible.length / level.maxPoints);
    const sampled: number[] = [];
    for (let i = 0; i < visible.length; i += stride) {
      sampled.push(visible[i]);
    }

    return new Uint32Array(sampled);
  }
}
