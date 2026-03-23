/**
 * Grid-based spatial index for fast nearest-neighbor lookup.
 * O(1) average case for point queries.
 * Built on the main thread (small datasets) or via DataWorker (large datasets).
 */

export interface SpatialIndexOptions {
  /** Grid cell size in world units. Smaller = faster lookup, more memory. */
  cellSize?: number;
}

export class SpatialIndex {
  private grid: Map<number, number[]> = new Map();
  private cellSize: number;
  private minX = 0;
  private minY = 0;
  private gridWidth = 0;

  constructor(
    private x: Float32Array,
    private y: Float32Array,
    options: SpatialIndexOptions = {},
  ) {
    // Auto-compute cell size if not provided
    if (options.cellSize !== undefined) {
      this.cellSize = options.cellSize;
    } else {
      this.cellSize = this.autoCellSize();
    }

    this.build();
  }

  private autoCellSize(): number {
    const n = this.x.length;
    if (n === 0) return 1;

    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < n; i++) {
      if (this.x[i] < minX) minX = this.x[i];
      if (this.x[i] > maxX) maxX = this.x[i];
      if (this.y[i] < minY) minY = this.y[i];
      if (this.y[i] > maxY) maxY = this.y[i];
    }
    const range = Math.max(maxX - minX, maxY - minY, 1);
    // Target ~50 cells across the range
    return range / 50;
  }

  private build(): void {
    const n = this.x.length;
    if (n === 0) return;

    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < n; i++) {
      if (this.x[i] < minX) minX = this.x[i];
      if (this.x[i] > maxX) maxX = this.x[i];
      if (this.y[i] < minY) minY = this.y[i];
      if (this.y[i] > maxY) maxY = this.y[i];
    }

    this.minX = minX;
    this.minY = minY;
    this.gridWidth = Math.ceil((maxX - minX) / this.cellSize) + 1;

    this.grid.clear();
    for (let i = 0; i < n; i++) {
      const key = this.cellKey(this.x[i], this.y[i]);
      if (!this.grid.has(key)) this.grid.set(key, []);
      this.grid.get(key)!.push(i);
    }
  }

  private cellKey(wx: number, wy: number): number {
    const cx = Math.floor((wx - this.minX) / this.cellSize);
    const cy = Math.floor((wy - this.minY) / this.cellSize);
    return cy * this.gridWidth + cx;
  }

  /**
   * Find the nearest point index within `radius` world units.
   * Returns -1 if none found.
   */
  nearest(wx: number, wy: number, radius: number): number {
    const cellRadius = Math.ceil(radius / this.cellSize);
    const cx = Math.floor((wx - this.minX) / this.cellSize);
    const cy = Math.floor((wy - this.minY) / this.cellSize);

    let bestIdx = -1;
    let bestDist = radius * radius; // compare squared distances

    for (let dy = -cellRadius; dy <= cellRadius; dy++) {
      for (let dx = -cellRadius; dx <= cellRadius; dx++) {
        const key = (cy + dy) * this.gridWidth + (cx + dx);
        const cell = this.grid.get(key);
        if (!cell) continue;

        for (const idx of cell) {
          const ddx = this.x[idx] - wx;
          const ddy = this.y[idx] - wy;
          const dist2 = ddx * ddx + ddy * ddy;
          if (dist2 < bestDist) {
            bestDist = dist2;
            bestIdx = idx;
          }
        }
      }
    }

    return bestIdx;
  }

  /**
   * Find all point indices within `radius` world units.
   */
  withinRadius(wx: number, wy: number, radius: number): number[] {
    const cellRadius = Math.ceil(radius / this.cellSize);
    const cx = Math.floor((wx - this.minX) / this.cellSize);
    const cy = Math.floor((wy - this.minY) / this.cellSize);

    const result: number[] = [];
    const r2 = radius * radius;

    for (let dy = -cellRadius; dy <= cellRadius; dy++) {
      for (let dx = -cellRadius; dx <= cellRadius; dx++) {
        const key = (cy + dy) * this.gridWidth + (cx + dx);
        const cell = this.grid.get(key);
        if (!cell) continue;

        for (const idx of cell) {
          const ddx = this.x[idx] - wx;
          const ddy = this.y[idx] - wy;
          if (ddx * ddx + ddy * ddy <= r2) {
            result.push(idx);
          }
        }
      }
    }

    return result;
  }

  /** Rebuild after data changes */
  rebuild(x: Float32Array, y: Float32Array): void {
    this.x = x;
    this.y = y;
    this.build();
  }
}
