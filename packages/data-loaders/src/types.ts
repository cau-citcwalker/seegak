export interface AnnDataSchema {
  nObs: number;
  nVars: number;
  obsNames: string[];
  varNames: string[];
  obsColumns: string[];
  embeddingKeys: string[];
}

export interface EmbeddingSlice {
  key: string;
  x: Float32Array;
  y: Float32Array;
}

export interface ExpressionSlice {
  varIndex: number;
  varName: string;
  values: Float32Array;
}

export interface ObsCategorySlice {
  key: string;
  values: string[];
  categories: string[];
}

export interface OmeZarrMetadata {
  axes: string[];
  channelNames: string[];
  nChannels: number;
  nLevels: number;
  levelShapes: Array<{ width: number; height: number }>;
  physicalSizeX?: number;
  physicalSizeY?: number;
  physicalUnit?: string;
}

export interface TileRequest {
  level: number;
  channelIndex: number;
  tileX: number;
  tileY: number;
  tileSize: number;
}

export interface TileResponse {
  data: Float32Array | Uint16Array | Uint8Array;
  width: number;
  height: number;
  dtype: 'float32' | 'uint16' | 'uint8';
}

export interface SpatialDataSchema {
  obsType: string;
  hasPoints: boolean;
  hasShapes: boolean;
  hasImages: boolean;
  coordinateSystemName: string;
  obsCount: number;
}
