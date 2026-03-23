/**
 * Main-thread interface for the data processing worker.
 * Provides a promise-based API over postMessage.
 */

import type { WorkerRequest, WorkerResponse } from './data-worker-protocol.js';

export class DataWorker {
  private worker: Worker;
  private nextId = 0;
  private pending = new Map<number, { resolve: (v: WorkerResponse) => void; reject: (e: Error) => void }>();

  constructor() {
    // Create worker from the impl module
    // The consumer's bundler (Vite, webpack, etc.) should handle worker bundling.
    // We provide a factory method for custom worker URLs.
    const blob = new Blob(
      ['importScripts is not available in module workers'],
      { type: 'application/javascript' },
    );
    // Placeholder — actual worker must be created via DataWorker.fromURL()
    this.worker = null!;
  }

  /**
   * Create a DataWorker from a worker script URL.
   * Usage with Vite:
   *   const worker = DataWorker.fromURL(new URL('./data-worker-impl.js', import.meta.url))
   * Usage with webpack:
   *   const worker = DataWorker.fromURL(new URL('./data-worker-impl.js', import.meta.url))
   */
  /**
   * Create a DataWorker from an existing Worker instance.
   * Usage with Vite:
   *   import DataWorkerImpl from '@seegak/core/worker/data-worker-impl?worker';
   *   const worker = DataWorker.fromWorker(new DataWorkerImpl());
   */
  static fromWorker(w: Worker): DataWorker {
    const instance = Object.create(DataWorker.prototype) as DataWorker;
    instance.worker = w;
    instance.nextId = 0;
    instance.pending = new Map();

    instance.worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const { id } = e.data;
      const handler = instance.pending.get(id);
      if (!handler) return;
      instance.pending.delete(id);

      if (e.data.type === 'error') {
        handler.reject(new Error((e.data as Extract<WorkerResponse, { type: 'error' }>).message));
      } else {
        handler.resolve(e.data);
      }
    };

    instance.worker.onerror = (e) => {
      for (const [, handler] of instance.pending) {
        handler.reject(new Error(e.message));
      }
      instance.pending.clear();
    };

    return instance;
  }

  static fromURL(url: URL | string): DataWorker {
    const instance = Object.create(DataWorker.prototype) as DataWorker;
    instance.worker = new Worker(url, { type: 'module' });
    instance.nextId = 0;
    instance.pending = new Map();

    instance.worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const { id } = e.data;
      const handler = instance.pending.get(id);
      if (!handler) return;
      instance.pending.delete(id);

      if (e.data.type === 'error') {
        handler.reject(new Error((e.data as Extract<WorkerResponse, { type: 'error' }>).message));
      } else {
        handler.resolve(e.data);
      }
    };

    instance.worker.onerror = (e) => {
      // Reject all pending requests
      for (const [, handler] of instance.pending) {
        handler.reject(new Error(e.message));
      }
      instance.pending.clear();
    };

    return instance;
  }

  private send<T extends WorkerResponse['type']>(
    request: Record<string, unknown>,
    transferables: ArrayBuffer[] = [],
  ): Promise<Extract<WorkerResponse, { type: T }>> {
    const id = this.nextId++;
    const fullRequest = { ...request, id } as WorkerRequest;

    return new Promise((resolve, reject) => {
      this.pending.set(id, {
        resolve: resolve as (v: WorkerResponse) => void,
        reject,
      });
      this.worker.postMessage(fullRequest, transferables as unknown as Transferable[]);
    });
  }

  // ─── Public API ───

  async downsample(
    x: Float32Array, y: Float32Array,
    targetCount: number,
    values?: Float32Array,
  ): Promise<{ x: Float32Array; y: Float32Array; indices: Uint32Array; values?: Float32Array }> {
    const result = await this.send<'downsample'>({
      type: 'downsample', x, y, targetCount, values,
    });
    return result as Extract<WorkerResponse, { type: 'downsample' }>;
  }

  async cluster(
    x: Float32Array, y: Float32Array,
    gridSize: number,
  ): Promise<{ centroids: Float32Array; counts: Uint32Array; clusterCount: number }> {
    const result = await this.send<'cluster'>({
      type: 'cluster', x, y, gridSize,
    });
    return result as Extract<WorkerResponse, { type: 'cluster' }>;
  }

  async computeStats(
    values: Float32Array,
    groupIndices: Uint32Array,
    groupCount: number,
  ): Promise<{ stats: Float32Array }> {
    const result = await this.send<'computeStats'>({
      type: 'computeStats', values, groupIndices, groupCount,
    });
    return result as Extract<WorkerResponse, { type: 'computeStats' }>;
  }

  async normalizeValues(
    values: Float32Array,
    min?: number,
    max?: number,
  ): Promise<{ normalized: Float32Array; min: number; max: number }> {
    const result = await this.send<'normalizeValues'>({
      type: 'normalizeValues', values, min, max,
    });
    return result as Extract<WorkerResponse, { type: 'normalizeValues' }>;
  }

  async buildSpatialIndex(
    x: Float32Array, y: Float32Array,
    cellSize: number,
  ): Promise<{ cells: Int32Array; gridWidth: number; gridHeight: number; cellSize: number; minX: number; minY: number }> {
    const result = await this.send<'spatialIndex'>({
      type: 'spatialIndex', x, y, cellSize,
    });
    return result as Extract<WorkerResponse, { type: 'spatialIndex' }>;
  }

  terminate(): void {
    this.worker.terminate();
    for (const [, handler] of this.pending) {
      handler.reject(new Error('Worker terminated'));
    }
    this.pending.clear();
  }
}
