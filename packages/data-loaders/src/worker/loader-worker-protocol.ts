export type LoaderWorkerRequest =
  | { type: 'openAnndata'; id: number; url: string }
  | { type: 'getEmbedding'; id: number; url: string; key: string }
  | { type: 'getExpression'; id: number; url: string; varName: string }
  | { type: 'getObsCategory'; id: number; url: string; key: string }
  | { type: 'openOmeZarr'; id: number; url: string }
  | { type: 'getTile'; id: number; url: string; level: number; channel: number; tx: number; ty: number; tileSize: number }
  | { type: 'openHdf5'; id: number; buffer: ArrayBuffer }
  | { type: 'readHdf5Dataset'; id: number; path: string }
  | { type: 'openSpatialData'; id: number; url: string };

export type LoaderWorkerResponse =
  | { type: 'openAnndata'; id: number; schema: import('../types.js').AnnDataSchema }
  | { type: 'getEmbedding'; id: number; x: Float32Array; y: Float32Array }
  | { type: 'getExpression'; id: number; values: Float32Array; varIndex: number }
  | { type: 'getObsCategory'; id: number; values: string[]; categories: string[] }
  | { type: 'openOmeZarr'; id: number; meta: import('../types.js').OmeZarrMetadata }
  | { type: 'getTile'; id: number; data: ArrayBuffer; width: number; height: number; dtype: string }
  | { type: 'readHdf5Dataset'; id: number; data: ArrayBuffer; shape: number[]; dtype: string }
  | { type: 'openSpatialData'; id: number; schema: import('../types.js').SpatialDataSchema }
  | { type: 'error'; id: number; message: string };
