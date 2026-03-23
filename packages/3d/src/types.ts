import type { BaseChartOptions } from '@seegak/bio-charts';

export interface VolumeData {
  buffer: ArrayBuffer;
  width: number;
  height: number;
  depth: number;
  dtype: 'uint8' | 'uint16' | 'float32';
  voxelSize?: [number, number, number];
}

export interface VolumeOptions extends BaseChartOptions {
  renderMode?: 'mip' | 'xray' | 'iso'; // default 'mip'
  isoValue?: number;                     // default 0.5 (normalized)
  colorScale?: 'viridis' | 'plasma' | 'inferno' | 'grays';
  opacity?: number;                      // default 0.8
  clipX?: [number, number];             // [0,1] normalized clip range
  clipY?: [number, number];
  clipZ?: [number, number];
}

export interface MeshData {
  vertices: Float32Array;  // xyz triples
  indices: Uint32Array;
  normals?: Float32Array;
  colors?: Float32Array;   // per-vertex RGBA
}

export interface MeshOptions extends BaseChartOptions {
  wireframe?: boolean;
  color?: string;
  opacity?: number;
  lighting?: boolean;
}
