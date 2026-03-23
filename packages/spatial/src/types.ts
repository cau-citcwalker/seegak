import type { OmeZarrMetadata } from '@seegak/data-loaders';

export interface ChannelConfig {
  name: string;
  visible: boolean;
  colormap: string;  // 'red'|'green'|'blue'|'cyan'|'magenta'|'yellow'|'white'|hex
  contrastLimits: [number, number];
}

export interface SpatialCells {
  x: Float32Array;
  y: Float32Array;
  labels?: string[];
  colors?: string[];
}

export interface SpatialImage {
  /** OME-ZARR metadata */
  meta: OmeZarrMetadata;
  /** URL to the OME-ZARR or OME-TIFF */
  url: string;
  channels: ChannelConfig[];
}

export interface SpatialMolecules {
  x: Float32Array;
  y: Float32Array;
  geneIds: string[];
}

export interface SpatialSegmentation {
  vertices: Float32Array;     // flat x,y pairs
  cellIndices: Uint32Array;   // which cell each polygon belongs to
  offsets: Uint32Array;       // start offset per cell in vertices
  counts: Uint32Array;        // vertex count per cell
}

export interface SpatialData {
  cells?: SpatialCells;
  image?: SpatialImage;
  molecules?: SpatialMolecules;
  segmentation?: SpatialSegmentation;
  /** Physical coordinate bounds [xMin, yMin, xMax, yMax] */
  bounds?: [number, number, number, number];
}
