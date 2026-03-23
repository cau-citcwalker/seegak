/**
 * Web Worker implementation for data loading.
 *
 * Handles AnnData-Zarr, OME-ZARR, HDF5, and SpatialData formats.
 * Uses fetch with Range headers for efficient chunk-level access.
 * No DOM or WebGL dependencies.
 */

import type { LoaderWorkerRequest, LoaderWorkerResponse } from './loader-worker-protocol.js';
import type { AnnDataSchema, OmeZarrMetadata, SpatialDataSchema } from '../types.js';

// ─── Zarr v2 helpers ──────────────────────────────────────────────────────────

interface ZarrayMeta {
  shape: number[];
  chunks: number[];
  dtype: string;
  order: 'C' | 'F';
  compressor: unknown;
  fill_value: number | null;
  zarr_format: number;
}

interface ZattrsMeta {
  [key: string]: unknown;
}

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  return res.json();
}

async function fetchZarray(baseUrl: string, arrayPath: string): Promise<ZarrayMeta> {
  const url = `${baseUrl.replace(/\/$/, '')}/${arrayPath.replace(/^\//, '')}/.zarray`;
  return fetchJson(url) as Promise<ZarrayMeta>;
}

async function fetchZattrs(baseUrl: string, groupPath: string): Promise<ZattrsMeta> {
  const url = `${baseUrl.replace(/\/$/, '')}/${groupPath.replace(/^\//, '')}/.zattrs`;
  const res = await fetch(url);
  if (!res.ok) return {};
  return res.json() as Promise<ZattrsMeta>;
}

async function fetchZgroupAttrs(baseUrl: string): Promise<ZattrsMeta> {
  return fetchZattrs(baseUrl, '');
}

/**
 * Fetch a single Zarr v2 chunk and return its raw bytes.
 * Chunk coordinates are joined with '.' for the filename.
 */
async function fetchZarrChunk(
  baseUrl: string,
  arrayPath: string,
  chunkCoords: number[],
): Promise<ArrayBuffer> {
  const coordStr = chunkCoords.join('.');
  const url = `${baseUrl.replace(/\/$/, '')}/${arrayPath.replace(/^\//, '')}/${coordStr}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching chunk ${url}`);
  return res.arrayBuffer();
}

/**
 * Parse Zarr dtype string into a TypedArray constructor and element byte size.
 */
// Use a loose constructor type so all TypedArray constructors satisfy it.
type NumericArrayCtor = new (buf: ArrayBuffer) => { [index: number]: number; length: number };

function parseDtype(dtype: string): { ArrayType: NumericArrayCtor; bytes: number; name: 'float32' | 'uint16' | 'uint8' | 'float64' | 'int32' | 'int64' } {
  // dtype examples: '<f4', '<u2', '|u1', '<i4', '<f8'
  const normalized = dtype.replace(/^[<>|=]/, '');
  switch (normalized) {
    case 'f4': return { ArrayType: Float32Array as unknown as NumericArrayCtor, bytes: 4, name: 'float32' };
    case 'f8': return { ArrayType: Float64Array as unknown as NumericArrayCtor, bytes: 8, name: 'float64' };
    case 'u2': return { ArrayType: Uint16Array as unknown as NumericArrayCtor, bytes: 2, name: 'uint16' };
    case 'u1': return { ArrayType: Uint8Array as unknown as NumericArrayCtor, bytes: 1, name: 'uint8' };
    case 'i4': return { ArrayType: Int32Array as unknown as NumericArrayCtor, bytes: 4, name: 'int32' };
    case 'i8': return { ArrayType: BigInt64Array as unknown as NumericArrayCtor, bytes: 8, name: 'int64' };
    default:   return { ArrayType: Uint8Array as unknown as NumericArrayCtor, bytes: 1, name: 'uint8' };
  }
}

/**
 * Read a full 1-D or 2-D Zarr array by fetching all its chunks.
 * Returns a flat Float32Array (converts from source dtype).
 */
async function readFullZarrArray(baseUrl: string, arrayPath: string): Promise<{ data: Float32Array; shape: number[]; meta: ZarrayMeta }> {
  const meta = await fetchZarray(baseUrl, arrayPath);
  const { shape, chunks, dtype } = meta;
  const { ArrayType, bytes } = parseDtype(dtype);

  const totalElements = shape.reduce((a, b) => a * b, 1);
  const out = new Float32Array(totalElements);

  // Compute chunk grid dimensions
  const nChunkDims = chunks.length;
  const nChunksPerDim = shape.map((s, i) => Math.ceil(s / chunks[i]));
  const totalChunks = nChunksPerDim.reduce((a, b) => a * b, 1);

  // Iterate over all chunks in C order
  for (let flatChunk = 0; flatChunk < totalChunks; flatChunk++) {
    // Convert flat chunk index to multi-dim coords
    const chunkCoords: number[] = new Array(nChunkDims).fill(0);
    let tmp = flatChunk;
    for (let d = nChunkDims - 1; d >= 0; d--) {
      chunkCoords[d] = tmp % nChunksPerDim[d];
      tmp = Math.floor(tmp / nChunksPerDim[d]);
    }

    const raw = await fetchZarrChunk(baseUrl, arrayPath, chunkCoords);
    const chunkView = new ArrayType(raw);

    // Compute the start offset in the output array for this chunk (C order)
    const chunkStart = chunkCoords.map((c, i) => c * chunks[i]);
    const chunkShape = chunkCoords.map((c, i) =>
      Math.min(chunks[i], shape[i] - c * chunks[i]),
    );

    // For 1-D arrays: direct copy
    if (nChunkDims === 1) {
      const outOffset = chunkStart[0];
      const len = chunkShape[0];
      for (let i = 0; i < len; i++) {
        out[outOffset + i] = chunkView[i] as number;
      }
    } else if (nChunkDims === 2) {
      // 2-D: row-major copy
      const [rowStart, colStart] = chunkStart;
      const [rowLen, colLen] = chunkShape;
      for (let r = 0; r < rowLen; r++) {
        const srcRow = r * chunks[1]; // chunk row stride
        const dstRow = (rowStart + r) * shape[1] + colStart;
        for (let c = 0; c < colLen; c++) {
          out[dstRow + c] = chunkView[srcRow + c] as number;
        }
      }
    } else {
      // Generic N-D: flatten chunk elements in C order to output
      // (simplified: treat as flat mapping for higher dims)
      const chunkTotalElements = chunkShape.reduce((a, b) => a * b, 1);
      // Compute output offset for chunk origin
      let outBase = 0;
      for (let d = 0; d < nChunkDims; d++) {
        let stride = 1;
        for (let dd = d + 1; dd < nChunkDims; dd++) stride *= shape[dd];
        outBase += chunkStart[d] * stride;
      }
      for (let i = 0; i < chunkTotalElements; i++) {
        out[outBase + i] = chunkView[i] as number;
      }
    }

    void bytes; // suppress unused warning — bytes used implicitly via ArrayType
  }

  return { data: out, shape, meta };
}

/**
 * Read a single 1-D chunk from a Zarr array (e.g. one row of obs embedding).
 * Faster than reading the full array when only one slice is needed.
 */
async function readZarrSlice1D(
  baseUrl: string,
  arrayPath: string,
  obsStart: number,
  obsEnd: number,
): Promise<Float32Array> {
  const meta = await fetchZarray(baseUrl, arrayPath);
  const { shape, chunks, dtype } = meta;
  const { ArrayType } = parseDtype(dtype);

  const len = obsEnd - obsStart;
  const out = new Float32Array(len);

  // Determine which chunks span [obsStart, obsEnd)
  const firstChunk = Math.floor(obsStart / chunks[0]);
  const lastChunk = Math.floor((obsEnd - 1) / chunks[0]);

  for (let ci = firstChunk; ci <= lastChunk; ci++) {
    const raw = await fetchZarrChunk(baseUrl, arrayPath, [ci]);
    const chunkView = new ArrayType(raw);

    const chunkStart = ci * chunks[0];
    const chunkEnd = Math.min(chunkStart + chunks[0], shape[0]);

    const srcFrom = Math.max(obsStart, chunkStart) - chunkStart;
    const srcTo = Math.min(obsEnd, chunkEnd) - chunkStart;
    const dstFrom = Math.max(obsStart, chunkStart) - obsStart;

    for (let i = srcFrom; i < srcTo; i++) {
      out[dstFrom + (i - srcFrom)] = chunkView[i] as number;
    }
  }

  return out;
}

// ─── AnnData-Zarr ─────────────────────────────────────────────────────────────

/**
 * Read obs_names / var_names from AnnData Zarr store.
 * They are stored as string arrays in `.obs/_index` and `.var/_index`.
 */
async function readStringArray(baseUrl: string, arrayPath: string): Promise<string[]> {
  // AnnData stores string arrays as object dtype with a separate string list
  // in `.zattrs` or as JSON-encoded Zarr object arrays.
  // The index is typically stored as a plain string Zarr array (dtype '|S...' or 'object').
  // We fetch chunk 0 and attempt to decode as a null-delimited or JSON list.
  const meta = await fetchZarray(baseUrl, arrayPath);
  const raw = await fetchZarrChunk(baseUrl, arrayPath, new Array(meta.chunks.length).fill(0));

  // Try JSON decoding (some AnnData stores use JSON-encoded string chunks)
  try {
    const text = new TextDecoder().decode(raw);
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed.map(String);
  } catch {
    // not JSON
  }

  // Try null-separated strings (Zarr |S fixed-width bytes)
  const text = new TextDecoder('utf-8', { fatal: false }).decode(raw);
  // Fixed-width string dtype: split by null chars, trim each
  if (text.includes('\0')) {
    const parts = text.split('\0').map(s => s.trim()).filter(Boolean);
    if (parts.length > 0) return parts;
  }

  // Fallback: newline-separated
  const lines = text.trim().split('\n').map(s => s.trim()).filter(Boolean);
  return lines;
}

async function openAnndata(url: string): Promise<AnnDataSchema> {
  const base = url.replace(/\/$/, '');

  // Fetch root .zattrs to confirm AnnData format
  const rootAttrs = await fetchZgroupAttrs(base);

  // Read obs index (cell names)
  let obsNames: string[] = [];
  let nObs = 0;
  let obsColumns: string[] = [];
  try {
    // The index column name may be stored in .obs/.zattrs as _index
    const obsAttrs = await fetchZattrs(base, '.obs');
    const obsIndexKey = (obsAttrs['_index'] as string | undefined) ?? '_index';

    const obsIndexMeta = await fetchZarray(base, `.obs/${obsIndexKey}`);
    nObs = obsIndexMeta.shape[0];
    obsNames = await readStringArray(base, `.obs/${obsIndexKey}`);

    // Enumerate obs columns from .obs/.zattrs column-order
    const colOrder = obsAttrs['column-order'];
    if (Array.isArray(colOrder)) {
      obsColumns = colOrder as string[];
    }
  } catch (e) {
    // obs may not be present in minimal stores
    console.warn('Could not read obs:', e);
  }

  // Read var index (gene names)
  let varNames: string[] = [];
  let nVars = 0;
  try {
    const varAttrs = await fetchZattrs(base, '.var');
    const varIndexKey = (varAttrs['_index'] as string | undefined) ?? '_index';

    const varIndexMeta = await fetchZarray(base, `.var/${varIndexKey}`);
    nVars = varIndexMeta.shape[0];
    varNames = await readStringArray(base, `.var/${varIndexKey}`);
  } catch (e) {
    console.warn('Could not read var:', e);
  }

  // Discover embedding keys from .obsm
  let embeddingKeys: string[] = [];
  try {
    const obsmAttrs = await fetchZattrs(base, '.obsm');
    // Keys are listed in .obsm/.zattrs or discoverable via .zgroup
    const keys = Object.keys(obsmAttrs).filter(k => !k.startsWith('_'));
    embeddingKeys = keys;
    if (embeddingKeys.length === 0) {
      // Try .obsm/.zgroup for nested arrays
      const zgroupUrl = `${base}/.obsm/.zgroup`;
      const zgroup = await fetch(zgroupUrl);
      if (zgroup.ok) {
        // Can't list directory in HTTP — common keys are X_umap, X_pca, X_tsne
        embeddingKeys = ['X_umap', 'X_pca', 'X_tsne'].filter(async (k) => {
          try {
            await fetchZarray(base, `.obsm/${k}`);
            return true;
          } catch {
            return false;
          }
        });
      }
    }
  } catch {
    // obsm may be absent
  }

  void rootAttrs; // used implicitly for validation
  return { nObs, nVars, obsNames, varNames, obsColumns, embeddingKeys };
}

async function getEmbedding(url: string, key: string): Promise<{ x: Float32Array; y: Float32Array }> {
  const base = url.replace(/\/$/, '');
  // Embedding stored as (nObs, 2+) array under .obsm/<key>
  const { data, shape } = await readFullZarrArray(base, `.obsm/${key}`);
  const nObs = shape[0];
  const nDims = shape.length > 1 ? shape[1] : 1;

  const x = new Float32Array(nObs);
  const y = new Float32Array(nObs);
  for (let i = 0; i < nObs; i++) {
    x[i] = data[i * nDims];
    y[i] = nDims > 1 ? data[i * nDims + 1] : 0;
  }
  return { x, y };
}

async function getExpression(url: string, varName: string): Promise<{ values: Float32Array; varIndex: number }> {
  const base = url.replace(/\/$/, '');

  // Find varIndex by reading var names
  const varAttrs = await fetchZattrs(base, '.var');
  const varIndexKey = (varAttrs['_index'] as string | undefined) ?? '_index';
  const varNames = await readStringArray(base, `.var/${varIndexKey}`);
  const varIndex = varNames.indexOf(varName);
  if (varIndex === -1) throw new Error(`Variable '${varName}' not found in var index`);

  // .X is stored as (nObs, nVars) — read column varIndex
  const xMeta = await fetchZarray(base, '.X');
  const [nObs, nVars] = xMeta.shape;
  const chunkRows = xMeta.chunks[0];
  const chunkCols = xMeta.chunks[1];
  const { ArrayType } = parseDtype(xMeta.dtype);

  // Which column-chunk contains varIndex?
  const colChunk = Math.floor(varIndex / chunkCols);
  const colOffset = varIndex % chunkCols;

  const out = new Float32Array(nObs);

  // Iterate over all row chunks for that column chunk
  const nRowChunks = Math.ceil(nObs / chunkRows);
  for (let rc = 0; rc < nRowChunks; rc++) {
    const raw = await fetchZarrChunk(base, '.X', [rc, colChunk]);
    const chunkView = new ArrayType(raw);

    const rowStart = rc * chunkRows;
    const rowEnd = Math.min(rowStart + chunkRows, nObs);

    // Actual chunk col count (may be less at boundary)
    const actualColsInChunk = Math.min(chunkCols, nVars - colChunk * chunkCols);

    for (let r = 0; r < rowEnd - rowStart; r++) {
      out[rowStart + r] = chunkView[r * actualColsInChunk + colOffset] as number;
    }
  }

  return { values: out, varIndex };
}

async function getObsCategory(url: string, key: string): Promise<{ values: string[]; categories: string[] }> {
  const base = url.replace(/\/$/, '');

  // Categorical obs column is stored as:
  //   .obs/<key>/codes   — integer codes array
  //   .obs/<key>/categories — string categories array
  let codes: number[] = [];
  let categories: string[] = [];

  try {
    const { data: codesData } = await readFullZarrArray(base, `.obs/${key}/codes`);
    codes = Array.from(codesData, v => Math.round(v));
    categories = await readStringArray(base, `.obs/${key}/categories`);
  } catch {
    // May be a plain string array (non-categorical)
    const vals = await readStringArray(base, `.obs/${key}`);
    return { values: vals, categories: [...new Set(vals)] };
  }

  const values = codes.map(c => categories[c] ?? '');
  return { values, categories };
}

// ─── OME-ZARR ─────────────────────────────────────────────────────────────────

async function openOmeZarr(url: string): Promise<OmeZarrMetadata> {
  const base = url.replace(/\/$/, '');

  // OME-ZARR metadata is in .zattrs at root
  const attrs = await fetchZattrs(base, '');
  const multiscales = attrs['multiscales'] as Array<{
    axes?: Array<{ name: string; type?: string; unit?: string }>;
    datasets?: Array<{ path: string; coordinateTransformations?: Array<{ type: string; scale?: number[] }> }>;
    version?: string;
  }> | undefined;

  if (!multiscales || multiscales.length === 0) {
    throw new Error('Not a valid OME-ZARR: missing multiscales metadata');
  }

  const ms = multiscales[0];
  const axes = (ms.axes ?? []).map(a => a.name);
  const nLevels = (ms.datasets ?? []).length;

  // Read level shapes from .zarray of each level
  const levelShapes: Array<{ width: number; height: number }> = [];
  let nChannels = 1;

  for (const ds of ms.datasets ?? []) {
    try {
      const meta = await fetchZarray(base, ds.path);
      // OME-ZARR shape: (t?, c, z?, y, x) — last two are y/x
      const shape = meta.shape;
      const height = shape[shape.length - 2] ?? 1;
      const width = shape[shape.length - 1] ?? 1;
      levelShapes.push({ width, height });
      // Channel count from second-to-last-or-earlier dim (index after t if present)
      const cIdx = axes.findIndex(a => a === 'c');
      if (cIdx >= 0 && cIdx < shape.length) {
        nChannels = shape[cIdx];
      }
    } catch {
      // skip bad level
    }
  }

  // Channel names from omero metadata
  let channelNames: string[] = [];
  const omero = attrs['omero'] as { channels?: Array<{ label?: string; color?: string }> } | undefined;
  if (omero?.channels) {
    channelNames = omero.channels.map((c, i) => c.label ?? `Channel ${i}`);
  } else {
    channelNames = Array.from({ length: nChannels }, (_, i) => `Channel ${i}`);
  }

  // Physical size from coordinateTransformations
  let physicalSizeX: number | undefined;
  let physicalSizeY: number | undefined;
  let physicalUnit: string | undefined;
  const firstDs = ms.datasets?.[0];
  if (firstDs?.coordinateTransformations) {
    for (const ct of firstDs.coordinateTransformations) {
      if (ct.type === 'scale' && ct.scale) {
        const xIdx = axes.findIndex(a => a === 'x');
        const yIdx = axes.findIndex(a => a === 'y');
        if (xIdx >= 0) physicalSizeX = ct.scale[xIdx];
        if (yIdx >= 0) physicalSizeY = ct.scale[yIdx];
      }
    }
  }
  const axisUnits = ms.axes?.find(a => a.name === 'x')?.unit;
  if (axisUnits) physicalUnit = axisUnits;

  return {
    axes,
    channelNames,
    nChannels,
    nLevels,
    levelShapes,
    physicalSizeX,
    physicalSizeY,
    physicalUnit,
  };
}

async function getTile(
  url: string,
  level: number,
  channel: number,
  tx: number,
  ty: number,
  tileSize: number,
): Promise<{ data: ArrayBuffer; width: number; height: number; dtype: string }> {
  const base = url.replace(/\/$/, '');

  // Get the multiscales dataset path for this level
  const attrs = await fetchZattrs(base, '');
  const multiscales = attrs['multiscales'] as Array<{ datasets?: Array<{ path: string }> }> | undefined;
  const levelPath = multiscales?.[0]?.datasets?.[level]?.path ?? String(level);

  // Read .zarray for this level
  const meta = await fetchZarray(base, levelPath);
  const { shape, chunks, dtype } = meta;
  const { bytes, name: dtypeName } = parseDtype(dtype);

  // OME-ZARR shape: (t, c, z, y, x) or (c, y, x) — parse dims
  // Chunk coords: determine chunk indices for (channel, tileY, tileX)
  // We support 5-D (t,c,z,y,x) and 3-D (c,y,x) layouts
  const ndim = shape.length;

  // Identify c/y/x axis indices
  const cAxis = ndim >= 4 ? ndim - 3 : 0;
  const yAxis = ndim - 2;
  const xAxis = ndim - 1;

  // Height/width of this level
  const levelHeight = shape[yAxis];
  const levelWidth = shape[xAxis];

  // Which Zarr chunks span this tile?
  const yChunkSize = chunks[yAxis];
  const xChunkSize = chunks[xAxis];
  const cChunkSize = chunks[cAxis];

  // Tile pixel coordinates
  const yPixStart = ty * tileSize;
  const xPixStart = tx * tileSize;
  const yPixEnd = Math.min(yPixStart + tileSize, levelHeight);
  const xPixEnd = Math.min(xPixStart + tileSize, levelWidth);
  const tileHeight = yPixEnd - yPixStart;
  const tileWidth = xPixEnd - xPixStart;

  if (tileHeight <= 0 || tileWidth <= 0) {
    return { data: new ArrayBuffer(0), width: 0, height: 0, dtype: dtypeName };
  }

  // Output tile buffer — always float32 for GPU upload simplicity
  const outF32 = new Float32Array(tileHeight * tileWidth);

  // Chunk indices spanning the tile
  const yChunkFirst = Math.floor(yPixStart / yChunkSize);
  const yChunkLast = Math.floor((yPixEnd - 1) / yChunkSize);
  const xChunkFirst = Math.floor(xPixStart / xChunkSize);
  const xChunkLast = Math.floor((xPixEnd - 1) / xChunkSize);
  const cChunk = Math.floor(channel / cChunkSize);
  const cOffset = channel % cChunkSize;

  for (let yci = yChunkFirst; yci <= yChunkLast; yci++) {
    for (let xci = xChunkFirst; xci <= xChunkLast; xci++) {
      // Build chunk coordinate array
      const chunkCoords = new Array(ndim).fill(0);
      chunkCoords[cAxis] = cChunk;
      chunkCoords[yAxis] = yci;
      chunkCoords[xAxis] = xci;
      // t and z stay 0 for now (single time-point, single z-plane)

      const raw = await fetchZarrChunk(base, levelPath, chunkCoords);

      // Number of bytes per element
      const elemCount = raw.byteLength / bytes;
      const chunkData = new Float32Array(elemCount);

      // Convert to float32
      const dtypeStr = dtype.replace(/^[<>|=]/, '');
      switch (dtypeStr) {
        case 'f4': {
          const v = new Float32Array(raw);
          chunkData.set(v);
          break;
        }
        case 'u2': {
          const v = new Uint16Array(raw);
          for (let i = 0; i < elemCount; i++) chunkData[i] = v[i];
          break;
        }
        case 'u1': {
          const v = new Uint8Array(raw);
          for (let i = 0; i < elemCount; i++) chunkData[i] = v[i];
          break;
        }
        case 'f8': {
          const v = new Float64Array(raw);
          for (let i = 0; i < elemCount; i++) chunkData[i] = v[i];
          break;
        }
        default: {
          const v = new Uint8Array(raw);
          for (let i = 0; i < elemCount; i++) chunkData[i] = v[i];
        }
      }

      // Actual chunk shape
      const actualCChunk = Math.min(cChunkSize, shape[cAxis] - cChunk * cChunkSize);
      const actualYChunk = Math.min(yChunkSize, shape[yAxis] - yci * yChunkSize);
      const actualXChunk = Math.min(xChunkSize, shape[xAxis] - xci * xChunkSize);

      // Chunk stride in C order (c, y, x within chunk)
      const chunkYStride = actualXChunk;
      const chunkCStride = actualYChunk * actualXChunk;

      // Pixel ranges in global coords for this chunk
      const chunkYStart = yci * yChunkSize;
      const chunkXStart = xci * xChunkSize;

      const copyYStart = Math.max(yPixStart, chunkYStart);
      const copyYEnd = Math.min(yPixEnd, chunkYStart + actualYChunk);
      const copyXStart = Math.max(xPixStart, chunkXStart);
      const copyXEnd = Math.min(xPixEnd, chunkXStart + actualXChunk);

      for (let gy = copyYStart; gy < copyYEnd; gy++) {
        const chunkY = gy - chunkYStart;
        const tileY = gy - yPixStart;
        for (let gx = copyXStart; gx < copyXEnd; gx++) {
          const chunkX = gx - chunkXStart;
          const tileX = gx - xPixStart;
          const srcIdx = cOffset * chunkCStride + chunkY * chunkYStride + chunkX;
          const dstIdx = tileY * tileWidth + tileX;
          outF32[dstIdx] = chunkData[srcIdx];
        }
      }

      void actualCChunk;
    }
  }

  return {
    data: outF32.buffer,
    width: tileWidth,
    height: tileHeight,
    dtype: 'float32',
  };
}

// ─── HDF5 ─────────────────────────────────────────────────────────────────────

// h5wasm is an optional dependency. We use a dynamic import so the worker
// can still load when h5wasm is absent and just returns an informative error.

let hdf5Buffer: ArrayBuffer | null = null;

async function openHdf5(buffer: ArrayBuffer): Promise<void> {
  hdf5Buffer = buffer;
  // Attempt to load h5wasm dynamically to verify it works
  try {
    const h5wasm = await import('h5wasm' as string).catch(() => null);
    if (!h5wasm) {
      console.warn('h5wasm not available; HDF5 datasets will return errors. Install h5wasm to enable HDF5 support.');
    }
  } catch {
    // ignore
  }
}

async function readHdf5Dataset(path: string): Promise<{ data: ArrayBuffer; shape: number[]; dtype: string }> {
  if (!hdf5Buffer) throw new Error('No HDF5 file opened. Call openHdf5 first.');

  type H5WasmModule = {
    default: {
      File: new (name: string, mode: string) => unknown;
      FS: { writeFile: (name: string, buf: Uint8Array) => void; unlink: (name: string) => void };
    };
  };
  let h5wasmMod: H5WasmModule | null = null;
  try {
    h5wasmMod = await import('h5wasm' as string) as H5WasmModule;
  } catch {
    throw new Error(
      'h5wasm is not installed. Add h5wasm to your dependencies to enable HDF5 support: npm install h5wasm',
    );
  }

  if (!h5wasmMod) {
    throw new Error('h5wasm failed to load.');
  }

  // h5wasm requires writing buffer to its virtual FS
  const { FS } = h5wasmMod.default;
  const tmpName = `/tmp_hdf5_${Date.now()}.h5`;
  FS.writeFile(tmpName, new Uint8Array(hdf5Buffer));

  const File = h5wasmMod.default.File as new (name: string, mode: string) => {
    get: (path: string) => { value: unknown; shape: number[]; dtype: { str: string } };
    close: () => void;
  };
  const f = new File(tmpName, 'r');
  try {
    const dataset = f.get(path);
    const rawValue = dataset.value;
    const shape: number[] = dataset.shape;
    const dtype: string = dataset.dtype.str;

    // Convert to ArrayBuffer
    let data: ArrayBuffer;
    if (rawValue instanceof ArrayBuffer) {
      data = rawValue;
    } else if (ArrayBuffer.isView(rawValue)) {
      const view = rawValue as ArrayBufferView;
      // Copy into a plain ArrayBuffer to avoid SharedArrayBuffer type issues.
      const tmp = new Uint8Array(view.byteLength);
      tmp.set(new Uint8Array(view.buffer as ArrayBuffer, view.byteOffset, view.byteLength));
      data = tmp.buffer;
    } else {
      // Fallback: JSON-encode to bytes
      const encoded = new TextEncoder().encode(JSON.stringify(rawValue));
      data = encoded.buffer as ArrayBuffer;
    }

    return { data, shape, dtype };
  } finally {
    f.close();
    try { FS.unlink(tmpName); } catch { /* ignore */ }
  }
}

// ─── SpatialData ──────────────────────────────────────────────────────────────

async function openSpatialData(url: string): Promise<SpatialDataSchema> {
  const base = url.replace(/\/$/, '');

  // SpatialData stores metadata in .zattrs at root
  const attrs = await fetchZattrs(base, '');
  const spatialDataAttrs = attrs as {
    'spatialdata_attrs'?: {
      version?: string;
      coordinate_systems?: Array<{ name: string }>;
    };
    obs?: { type?: string; count?: number };
    points?: unknown;
    shapes?: unknown;
    images?: unknown;
  };

  const coordinateSystemName =
    spatialDataAttrs['spatialdata_attrs']?.coordinate_systems?.[0]?.name ?? 'global';

  // Check for top-level groups indicating data types
  const hasPoints = await probe(`${base}/points/.zgroup`);
  const hasShapes = await probe(`${base}/shapes/.zgroup`);
  const hasImages = await probe(`${base}/images/.zgroup`);

  // Obs count from table/obs
  let obsCount = 0;
  let obsType = 'cell';
  try {
    const tableAttrs = await fetchZattrs(base, 'table');
    const anndata = tableAttrs['encoding-type'];
    if (anndata === 'anndata' || typeof tableAttrs['encoding-type'] === 'string') {
      const obsIndexMeta = await fetchZarray(base, 'table/obs/_index');
      obsCount = obsIndexMeta.shape[0];
    }
    if (typeof tableAttrs['obs_type'] === 'string') {
      obsType = tableAttrs['obs_type'] as string;
    }
  } catch {
    // table may be absent
  }

  return {
    obsType,
    hasPoints,
    hasShapes,
    hasImages,
    coordinateSystemName,
    obsCount,
  };
}

async function probe(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: 'HEAD' });
    return res.ok;
  } catch {
    return false;
  }
}

// ─── Worker message dispatch ──────────────────────────────────────────────────

// Cast self to a minimal worker interface with the right postMessage overload.
interface WorkerGlobal {
  postMessage(message: unknown, transfer: Transferable[]): void;
  postMessage(message: unknown, options?: { transfer?: Transferable[] }): void;
  onmessage: ((event: MessageEvent) => void) | null;
}
const workerSelf = self as unknown as WorkerGlobal;

function send(response: LoaderWorkerResponse, transferables: ArrayBuffer[] = []): void {
  workerSelf.postMessage(response, transferables as Transferable[]);
}

function sendError(id: number, err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  send({ type: 'error', id, message });
}

workerSelf.onmessage = async (event: MessageEvent<LoaderWorkerRequest>) => {
  const req = event.data;

  try {
    switch (req.type) {
      case 'openAnndata': {
        const schema = await openAnndata(req.url);
        send({ type: 'openAnndata', id: req.id, schema });
        break;
      }

      case 'getEmbedding': {
        const { x, y } = await getEmbedding(req.url, req.key);
        send(
          { type: 'getEmbedding', id: req.id, x, y },
          [x.buffer as ArrayBuffer, y.buffer as ArrayBuffer],
        );
        break;
      }

      case 'getExpression': {
        const { values, varIndex } = await getExpression(req.url, req.varName);
        send(
          { type: 'getExpression', id: req.id, values, varIndex },
          [values.buffer as ArrayBuffer],
        );
        break;
      }

      case 'getObsCategory': {
        const { values, categories } = await getObsCategory(req.url, req.key);
        send({ type: 'getObsCategory', id: req.id, values, categories });
        break;
      }

      case 'openOmeZarr': {
        const meta = await openOmeZarr(req.url);
        send({ type: 'openOmeZarr', id: req.id, meta });
        break;
      }

      case 'getTile': {
        const { data, width, height, dtype } = await getTile(
          req.url, req.level, req.channel, req.tx, req.ty, req.tileSize,
        );
        send(
          { type: 'getTile', id: req.id, data, width, height, dtype },
          data.byteLength > 0 ? [data] : [],
        );
        break;
      }

      case 'openHdf5': {
        await openHdf5(req.buffer);
        // No dedicated response type for openHdf5 — reuse readHdf5Dataset with empty result
        // Signal success by sending a readHdf5Dataset response with empty data
        send({
          type: 'readHdf5Dataset',
          id: req.id,
          data: new ArrayBuffer(0),
          shape: [],
          dtype: 'void',
        });
        break;
      }

      case 'readHdf5Dataset': {
        const { data, shape, dtype } = await readHdf5Dataset(req.path);
        send(
          { type: 'readHdf5Dataset', id: req.id, data, shape, dtype },
          [data],
        );
        break;
      }

      case 'openSpatialData': {
        const schema = await openSpatialData(req.url);
        send({ type: 'openSpatialData', id: req.id, schema });
        break;
      }

      default:
        // Exhaustiveness guard
        sendError((req as { id: number }).id, `Unknown request type: ${(req as { type: string }).type}`);
    }
  } catch (err) {
    sendError(req.id, err);
  }
};
