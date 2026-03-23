/**
 * Protocol for main thread ↔ worker communication.
 * Uses typed messages and transferable ArrayBuffers for zero-copy transfers.
 */

export type WorkerRequest =
  | { type: 'downsample'; id: number; x: Float32Array; y: Float32Array; targetCount: number; values?: Float32Array }
  | { type: 'cluster'; id: number; x: Float32Array; y: Float32Array; gridSize: number }
  | { type: 'computeStats'; id: number; values: Float32Array; groupIndices: Uint32Array; groupCount: number }
  | { type: 'normalizeValues'; id: number; values: Float32Array; min?: number; max?: number }
  | { type: 'spatialIndex'; id: number; x: Float32Array; y: Float32Array; cellSize: number };

export type WorkerResponse =
  | { type: 'downsample'; id: number; x: Float32Array; y: Float32Array; indices: Uint32Array; values?: Float32Array }
  | { type: 'cluster'; id: number; centroids: Float32Array; counts: Uint32Array; clusterCount: number }
  | { type: 'computeStats'; id: number; stats: Float32Array } // [min, q1, median, q3, max] × groupCount
  | { type: 'normalizeValues'; id: number; normalized: Float32Array; min: number; max: number }
  | { type: 'spatialIndex'; id: number; cells: Int32Array; gridWidth: number; gridHeight: number; cellSize: number; minX: number; minY: number }
  | { type: 'error'; id: number; message: string };
