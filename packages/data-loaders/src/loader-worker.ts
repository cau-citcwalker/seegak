/**
 * Main-thread facade for the loader Web Worker.
 *
 * Provides a Promise-based API that mirrors the worker protocol.
 * Uses postMessage with transferable ArrayBuffers for zero-copy I/O.
 *
 * Usage with Vite:
 *   import LoaderWorkerImpl from '@seegak/data-loaders/worker/loader-worker-impl?worker';
 *   const loader = LoaderWorker.fromWorker(new LoaderWorkerImpl());
 *
 * Usage with a URL (any bundler):
 *   const loader = LoaderWorker.fromURL(new URL('./loader-worker-impl.js', import.meta.url));
 */

import type { LoaderWorkerRequest, LoaderWorkerResponse } from './worker/loader-worker-protocol.js';
import type {
  AnnDataSchema,
  EmbeddingSlice,
  ExpressionSlice,
  ObsCategorySlice,
  OmeZarrMetadata,
  TileResponse,
} from './types.js';

export type { AnnDataSchema, EmbeddingSlice, ExpressionSlice, ObsCategorySlice, OmeZarrMetadata, TileResponse };

type PendingEntry = {
  resolve: (v: LoaderWorkerResponse) => void;
  reject: (e: Error) => void;
};

export class LoaderWorker {
  private worker: Worker;
  private pending: Map<number, PendingEntry>;
  private nextId: number = 0;

  // Private — use static factory methods.
  private constructor(w: Worker) {
    this.worker = w;
    this.pending = new Map();

    this.worker.onmessage = (e: MessageEvent<LoaderWorkerResponse>) => {
      const { id } = e.data;
      const handler = this.pending.get(id);
      if (!handler) return;
      this.pending.delete(id);

      if (e.data.type === 'error') {
        handler.reject(new Error((e.data as Extract<LoaderWorkerResponse, { type: 'error' }>).message));
      } else {
        handler.resolve(e.data);
      }
    };

    this.worker.onerror = (e: ErrorEvent) => {
      const err = new Error(e.message ?? 'LoaderWorker error');
      for (const [, handler] of this.pending) {
        handler.reject(err);
      }
      this.pending.clear();
    };
  }

  /** Create a LoaderWorker from an already-instantiated Worker object. */
  static fromWorker(w: Worker): LoaderWorker {
    return new LoaderWorker(w);
  }

  /**
   * Create a LoaderWorker by URL.
   * The script at `url` must be the compiled `loader-worker-impl.js`.
   */
  static fromURL(url: string | URL): LoaderWorker {
    return new LoaderWorker(new Worker(url, { type: 'module' }));
  }

  // ─── Internal send helper ──────────────────────────────────────────────────

  private send<T extends LoaderWorkerResponse['type']>(
    request: Record<string, unknown>,
    transferables: ArrayBuffer[] = [],
  ): Promise<Extract<LoaderWorkerResponse, { type: T }>> {
    const id = this.nextId++;
    const fullRequest = { ...request, id } as unknown as LoaderWorkerRequest;

    return new Promise((resolve, reject) => {
      this.pending.set(id, {
        resolve: resolve as (v: LoaderWorkerResponse) => void,
        reject,
      });
      this.worker.postMessage(fullRequest, transferables as unknown as Transferable[]);
    });
  }

  // ─── AnnData API ──────────────────────────────────────────────────────────

  /** Open an AnnData Zarr store and return its schema. */
  async openAnndata(url: string): Promise<AnnDataSchema> {
    const res = await this.send<'openAnndata'>({ type: 'openAnndata', url });
    return (res as Extract<LoaderWorkerResponse, { type: 'openAnndata' }>).schema;
  }

  /** Fetch a 2-D embedding (e.g. 'X_umap', 'X_pca') from the store. */
  async getEmbedding(url: string, key: string): Promise<EmbeddingSlice> {
    const res = await this.send<'getEmbedding'>({ type: 'getEmbedding', url, key });
    const r = res as Extract<LoaderWorkerResponse, { type: 'getEmbedding' }>;
    return { key, x: r.x, y: r.y };
  }

  /** Fetch per-cell expression values for a named variable. */
  async getExpression(url: string, varName: string): Promise<ExpressionSlice> {
    const res = await this.send<'getExpression'>({ type: 'getExpression', url, varName });
    const r = res as Extract<LoaderWorkerResponse, { type: 'getExpression' }>;
    return { varIndex: r.varIndex, varName, values: r.values };
  }

  /** Fetch a categorical obs column. */
  async getObsCategory(url: string, key: string): Promise<ObsCategorySlice> {
    const res = await this.send<'getObsCategory'>({ type: 'getObsCategory', url, key });
    const r = res as Extract<LoaderWorkerResponse, { type: 'getObsCategory' }>;
    return { key, values: r.values, categories: r.categories };
  }

  // ─── OME-ZARR API ─────────────────────────────────────────────────────────

  /** Open an OME-ZARR image store and return its metadata. */
  async openOmeZarr(url: string): Promise<OmeZarrMetadata> {
    const res = await this.send<'openOmeZarr'>({ type: 'openOmeZarr', url });
    return (res as Extract<LoaderWorkerResponse, { type: 'openOmeZarr' }>).meta;
  }

  /**
   * Fetch a single tile from an OME-ZARR pyramid level.
   *
   * @param url       - Root URL of the OME-ZARR store
   * @param level     - Pyramid level (0 = full resolution)
   * @param channel   - Channel index
   * @param tx        - Tile column index
   * @param ty        - Tile row index
   * @param tileSize  - Tile size in pixels (default 256)
   */
  async getTile(
    url: string,
    level: number,
    channel: number,
    tx: number,
    ty: number,
    tileSize: number = 256,
  ): Promise<TileResponse> {
    const res = await this.send<'getTile'>({
      type: 'getTile',
      url,
      level,
      channel,
      tx,
      ty,
      tileSize,
    });
    const r = res as Extract<LoaderWorkerResponse, { type: 'getTile' }>;
    const dtype = r.dtype as TileResponse['dtype'];

    let data: Float32Array | Uint16Array | Uint8Array;
    switch (dtype) {
      case 'uint16': data = new Uint16Array(r.data); break;
      case 'uint8':  data = new Uint8Array(r.data);  break;
      default:       data = new Float32Array(r.data); break;
    }

    return { data, width: r.width, height: r.height, dtype };
  }

  // ─── HDF5 API ─────────────────────────────────────────────────────────────

  /**
   * Load an HDF5 file from an ArrayBuffer.
   * Requires h5wasm to be installed in the worker's environment.
   * The buffer is transferred to the worker (zero-copy).
   */
  async openHdf5(buffer: ArrayBuffer): Promise<void> {
    await this.send<'readHdf5Dataset'>(
      { type: 'openHdf5', buffer },
      [buffer],
    );
  }

  /** Read a dataset at `path` from the previously opened HDF5 file. */
  async readHdf5Dataset(path: string): Promise<{ data: ArrayBuffer; shape: number[]; dtype: string }> {
    const res = await this.send<'readHdf5Dataset'>({ type: 'readHdf5Dataset', path });
    const r = res as Extract<LoaderWorkerResponse, { type: 'readHdf5Dataset' }>;
    return { data: r.data, shape: r.shape, dtype: r.dtype };
  }

  // ─── SpatialData API ──────────────────────────────────────────────────────

  /** Open a SpatialData Zarr store and return its schema. */
  async openSpatialData(url: string): Promise<import('./types.js').SpatialDataSchema> {
    const res = await this.send<'openSpatialData'>({ type: 'openSpatialData', url });
    return (res as Extract<LoaderWorkerResponse, { type: 'openSpatialData' }>).schema;
  }

  // ─── Lifecycle ────────────────────────────────────────────────────────────

  /** Terminate the underlying Worker and reject all pending promises. */
  dispose(): void {
    this.worker.terminate();
    const err = new Error('LoaderWorker disposed');
    for (const [, handler] of this.pending) {
      handler.reject(err);
    }
    this.pending.clear();
  }
}
