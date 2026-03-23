// Types
export type {
  AnnDataSchema,
  EmbeddingSlice,
  ExpressionSlice,
  ObsCategorySlice,
  OmeZarrMetadata,
  TileRequest,
  TileResponse,
  SpatialDataSchema,
} from './types.js';

// Main-thread facade
export { LoaderWorker } from './loader-worker.js';

// S3 source helper
export { S3Source } from './s3-source.js';
export type { S3SourceOptions } from './s3-source.js';

// Tile cache (usable on either main thread or in worker)
export { TileCache } from './tile-cache.js';

// Worker protocol types (for consumers who instantiate their own worker)
export type { LoaderWorkerRequest, LoaderWorkerResponse } from './worker/loader-worker-protocol.js';
