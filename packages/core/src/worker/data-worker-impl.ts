/**
 * Worker implementation — runs in a separate thread.
 * Handles heavy data processing: downsampling, clustering, statistics.
 */

import type { WorkerRequest, WorkerResponse } from './data-worker-protocol.js';

function handleMessage(req: WorkerRequest): WorkerResponse {
  switch (req.type) {
    case 'downsample':
      return downsample(req);
    case 'cluster':
      return gridCluster(req);
    case 'computeStats':
      return computeBoxStats(req);
    case 'normalizeValues':
      return normalizeValues(req);
    case 'spatialIndex':
      return buildSpatialIndex(req);
  }
}

// ─── Downsampling ───
// Reservoir sampling: uniform random subset preserving distribution

function downsample(req: Extract<WorkerRequest, { type: 'downsample' }>): WorkerResponse {
  const n = req.x.length;
  const target = Math.min(req.targetCount, n);

  if (target >= n) {
    return {
      type: 'downsample', id: req.id,
      x: req.x, y: req.y,
      indices: Uint32Array.from({ length: n }, (_, i) => i),
      values: req.values,
    };
  }

  // Reservoir sampling
  const indices = new Uint32Array(target);
  for (let i = 0; i < target; i++) indices[i] = i;
  for (let i = target; i < n; i++) {
    const j = Math.floor(Math.random() * (i + 1));
    if (j < target) indices[j] = i;
  }
  indices.sort();

  const outX = new Float32Array(target);
  const outY = new Float32Array(target);
  let outValues: Float32Array | undefined;
  if (req.values) outValues = new Float32Array(target);

  for (let i = 0; i < target; i++) {
    const idx = indices[i];
    outX[i] = req.x[idx];
    outY[i] = req.y[idx];
    if (outValues && req.values) outValues[i] = req.values[idx];
  }

  return { type: 'downsample', id: req.id, x: outX, y: outY, indices, values: outValues };
}

// ─── Grid Clustering ───
// Groups nearby points into grid cells for LOD rendering

function gridCluster(req: Extract<WorkerRequest, { type: 'cluster' }>): WorkerResponse {
  const n = req.x.length;
  const gs = req.gridSize;

  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < n; i++) {
    if (req.x[i] < minX) minX = req.x[i];
    if (req.x[i] > maxX) maxX = req.x[i];
    if (req.y[i] < minY) minY = req.y[i];
    if (req.y[i] > maxY) maxY = req.y[i];
  }

  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;
  const cellW = rangeX / gs;
  const cellH = rangeY / gs;
  const totalCells = gs * gs;

  const sumX = new Float64Array(totalCells);
  const sumY = new Float64Array(totalCells);
  const counts = new Uint32Array(totalCells);

  for (let i = 0; i < n; i++) {
    const cx = Math.min(Math.floor((req.x[i] - minX) / cellW), gs - 1);
    const cy = Math.min(Math.floor((req.y[i] - minY) / cellH), gs - 1);
    const idx = cy * gs + cx;
    sumX[idx] += req.x[i];
    sumY[idx] += req.y[i];
    counts[idx]++;
  }

  // Collect non-empty cells
  let clusterCount = 0;
  for (let i = 0; i < totalCells; i++) {
    if (counts[i] > 0) clusterCount++;
  }

  const centroids = new Float32Array(clusterCount * 2);
  const outCounts = new Uint32Array(clusterCount);
  let ci = 0;
  for (let i = 0; i < totalCells; i++) {
    if (counts[i] > 0) {
      centroids[ci * 2] = sumX[i] / counts[i];
      centroids[ci * 2 + 1] = sumY[i] / counts[i];
      outCounts[ci] = counts[i];
      ci++;
    }
  }

  return { type: 'cluster', id: req.id, centroids, counts: outCounts, clusterCount };
}

// ─── Box Plot Statistics ───

function computeBoxStats(req: Extract<WorkerRequest, { type: 'computeStats' }>): WorkerResponse {
  const { values, groupIndices, groupCount } = req;

  // Group values
  const groups: number[][] = Array.from({ length: groupCount }, () => []);
  for (let i = 0; i < values.length; i++) {
    const gi = groupIndices[i];
    if (gi < groupCount) {
      groups[gi].push(values[i]);
    }
  }

  // 5 stats per group: min, q1, median, q3, max
  const stats = new Float32Array(groupCount * 5);

  for (let g = 0; g < groupCount; g++) {
    const sorted = groups[g].sort((a, b) => a - b);
    const n = sorted.length;

    if (n === 0) {
      stats.set([0, 0, 0, 0, 0], g * 5);
      continue;
    }

    const pct = (p: number) => {
      const idx = p * (n - 1);
      const lo = Math.floor(idx);
      const hi = Math.ceil(idx);
      return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
    };

    stats[g * 5 + 0] = sorted[0];
    stats[g * 5 + 1] = pct(0.25);
    stats[g * 5 + 2] = pct(0.5);
    stats[g * 5 + 3] = pct(0.75);
    stats[g * 5 + 4] = sorted[n - 1];
  }

  return { type: 'computeStats', id: req.id, stats };
}

// ─── Normalize Values ───

function normalizeValues(req: Extract<WorkerRequest, { type: 'normalizeValues' }>): WorkerResponse {
  const { values } = req;
  const n = values.length;

  let min = req.min ?? Infinity;
  let max = req.max ?? -Infinity;

  if (req.min === undefined || req.max === undefined) {
    for (let i = 0; i < n; i++) {
      if (values[i] < min) min = values[i];
      if (values[i] > max) max = values[i];
    }
  }

  const range = max - min || 1;
  const normalized = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    normalized[i] = (values[i] - min) / range;
  }

  return { type: 'normalizeValues', id: req.id, normalized, min, max };
}

// ─── Spatial Index ───
// Builds a grid-based spatial index for fast hit testing

function buildSpatialIndex(req: Extract<WorkerRequest, { type: 'spatialIndex' }>): WorkerResponse {
  const { x, y, cellSize } = req;
  const n = x.length;

  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < n; i++) {
    if (x[i] < minX) minX = x[i];
    if (x[i] > maxX) maxX = x[i];
    if (y[i] < minY) minY = y[i];
    if (y[i] > maxY) maxY = y[i];
  }

  const gridWidth = Math.ceil((maxX - minX) / cellSize) + 1;
  const gridHeight = Math.ceil((maxY - minY) / cellSize) + 1;

  // cells[i] = first point index in cell i, linked list via next array
  // Using flat Int32Array: for each point, store its cell assignment
  const cells = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    const cx = Math.floor((x[i] - minX) / cellSize);
    const cy = Math.floor((y[i] - minY) / cellSize);
    cells[i] = cy * gridWidth + cx;
  }

  return {
    type: 'spatialIndex', id: req.id,
    cells, gridWidth, gridHeight, cellSize, minX, minY,
  };
}

// ─── Worker Entry Point ───

const ctx = self as unknown as Worker;

ctx.onmessage = (e: MessageEvent<WorkerRequest>) => {
  try {
    const response = handleMessage(e.data);
    // Collect transferable buffers
    const transferables: ArrayBuffer[] = [];
    const collectBuffer = (arr?: ArrayBufferView) => {
      if (arr?.buffer && arr.buffer instanceof ArrayBuffer) {
        transferables.push(arr.buffer);
      }
    };

    if (response.type === 'downsample') {
      collectBuffer(response.x);
      collectBuffer(response.y);
      collectBuffer(response.indices);
      collectBuffer(response.values);
    } else if (response.type === 'cluster') {
      collectBuffer(response.centroids);
      collectBuffer(response.counts);
    } else if (response.type === 'computeStats') {
      collectBuffer(response.stats);
    } else if (response.type === 'normalizeValues') {
      collectBuffer(response.normalized);
    } else if (response.type === 'spatialIndex') {
      collectBuffer(response.cells);
    }

    ctx.postMessage(response, transferables as unknown as Transferable[]);
  } catch (err) {
    ctx.postMessage({
      type: 'error',
      id: e.data.id,
      message: err instanceof Error ? err.message : String(err),
    } satisfies WorkerResponse);
  }
};
