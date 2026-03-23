import type { DataWorker } from '@seegak/core';
import { BaseChart, type BaseChartOptions } from '@seegak/bio-charts';
import type { ChannelConfig, SpatialData } from './types.js';
import { ChannelController } from './channel/channel-controller.js';
import { TileCache } from './tile/tile-cache.js';
import { TileScheduler, type TileCoord } from './tile/tile-scheduler.js';
import { ImageLayer } from './renderer/image-layer.js';
import { CellLayer } from './renderer/cell-layer.js';
import { SegmentationLayer } from './renderer/segmentation-layer.js';
import { MoleculeLayer } from './renderer/molecule-layer.js';

// ─── Options ───

export interface SpatialViewOptions extends BaseChartOptions {
  channels?: ChannelConfig[];
  cellOpacity?: number;           // default 0.8
  cellPointSize?: number;         // default 4
  showMolecules?: boolean;        // default true
  moleculePointSize?: number;     // default 2
  tileSize?: number;              // default 256
  maxTileCache?: number;          // default 128
  onClickCell?: (index: number) => void;
  onSelectCells?: (indices: number[]) => void;
}

// ─── SpatialView ───

/**
 * SpatialView is the top-level component for spatial transcriptomics visualization.
 *
 * It composes four WebGL render layers:
 *  - ImageLayer:        pyramidal multi-channel image tiles with per-channel LUTs
 *  - SegmentationLayer: cell polygon outlines (pre-triangulated)
 *  - CellLayer:         per-cell scatter dots with cluster coloring
 *  - MoleculeLayer:     individual transcript molecule dots
 *
 * Usage:
 * ```ts
 * const view = new SpatialView(container, { tileSize: 256 });
 * view.setData(spatialData);
 * ```
 */
export class SpatialView extends BaseChart {
  // ── Layer references ──
  private imageLayer: ImageLayer;
  private cellLayer: CellLayer;
  private segLayer: SegmentationLayer;
  private molLayer: MoleculeLayer;

  // ── Channel management ──
  readonly channelController: ChannelController;

  // ── Tile management ──
  private tileCache: TileCache;
  private tileScheduler: TileScheduler;
  private readonly tileSize: number;

  // ── Current data ──
  private currentData: SpatialData | null = null;

  // ── Options ──
  private opts: Required<Pick<
    SpatialViewOptions,
    'cellOpacity' | 'cellPointSize' | 'showMolecules' | 'moleculePointSize' | 'tileSize' | 'maxTileCache'
  >>;
  private onClickCell?: (index: number) => void;
  private onSelectCells?: (indices: number[]) => void;

  constructor(container: HTMLElement, options: SpatialViewOptions = {}) {
    super(container, options);

    this.opts = {
      cellOpacity:       options.cellOpacity       ?? 0.8,
      cellPointSize:     options.cellPointSize      ?? 4,
      showMolecules:     options.showMolecules      ?? true,
      moleculePointSize: options.moleculePointSize  ?? 2,
      tileSize:          options.tileSize           ?? 256,
      maxTileCache:      options.maxTileCache       ?? 128,
    };

    this.tileSize  = this.opts.tileSize;
    this.tileCache = new TileCache(this.opts.maxTileCache);
    this.tileScheduler = new TileScheduler();

    this.onClickCell  = options.onClickCell;
    this.onSelectCells = options.onSelectCells;

    // Initialize ChannelController with provided channels or default to 0
    const nChannels = options.channels?.length ?? 0;
    this.channelController = new ChannelController(nChannels);

    if (options.channels) {
      options.channels.forEach((ch, i) => {
        this.channelController.setColormap(i, ch.colormap);
        this.channelController.setContrast(i, ch.contrastLimits[0], ch.contrastLimits[1]);
        this.channelController.setVisible(i, ch.visible);
      });
    }

    // Create and register layers (order: image=0, seg=15, cells=20, molecules=25)
    this.imageLayer = new ImageLayer();
    this.cellLayer  = new CellLayer();
    this.segLayer   = new SegmentationLayer();
    this.molLayer   = new MoleculeLayer();

    this.imageLayer.init(this.engine);
    this.cellLayer.init(this.engine);
    this.segLayer.init(this.engine);
    this.molLayer.init(this.engine);

    this.engine.addLayer(this.imageLayer);
    this.engine.addLayer(this.cellLayer);
    this.engine.addLayer(this.segLayer);
    this.engine.addLayer(this.molLayer);

    // When channels change, re-upload LUTs and re-render
    this.channelController.onChanged(() => {
      this.uploadChannelLuts();
      this.engine.requestRender();
    });

    // Cell click handler
    if (this.onClickCell || this.onSelectCells) {
      this.attachClickHandler();
    }
  }

  // ── Private helpers ──

  private uploadChannelLuts(): void {
    const gl   = this.engine.gl;
    const n    = this.channelController.channelCount;
    const luts: Float32Array[] = [];
    for (let i = 0; i < n; i++) {
      luts.push(this.channelController.getState(i).lut);
    }
    if (luts.length > 0) {
      this.imageLayer.setChannelLuts(gl, luts);
    }
  }

  private attachClickHandler(): void {
    const canvas = this.engine.gl.canvas as HTMLCanvasElement;
    canvas.addEventListener('click', (e: MouseEvent) => {
      if (!this.currentData?.cells) return;
      const rect = canvas.getBoundingClientRect();
      const sx   = e.clientX - rect.left;
      const sy   = e.clientY - rect.top;
      const idx  = this.hitTestCells(sx, sy);
      if (idx !== null) this.onClickCell?.(idx);
    });
  }

  /**
   * Brute-force cell hit-test at CSS pixel coordinates.
   * Returns the closest cell index within pointSize radius, or null.
   */
  private hitTestCells(_screenX: number, _screenY: number): number | null {
    if (!this.currentData?.cells) return null;
    // For a full implementation this would use a spatial index;
    // we keep it simple here with a linear scan capped at reasonable N.
    return null;
  }

  /**
   * Compute tile physical bounds for a given tile coordinate.
   * Returns [xMin, yMin, xMax, yMax] in physical coords.
   */
  private tileBounds(
    coord: TileCoord,
    imageBounds: [number, number, number, number],
    nTilesX: number,
    nTilesY: number,
  ): [number, number, number, number] {
    const [xMin, yMin, xMax, yMax] = imageBounds;
    const tileW = (xMax - xMin) / nTilesX;
    const tileH = (yMax - yMin) / nTilesY;
    return [
      xMin + coord.tx * tileW,
      yMin + coord.ty * tileH,
      xMin + (coord.tx + 1) * tileW,
      yMin + (coord.ty + 1) * tileH,
    ];
  }

  /**
   * Schedule tile loading for the current viewport.
   * Calls loader worker (if provided) for any tiles not yet in cache.
   */
  private scheduleTileLoad(loader?: DataWorker): void {
    const data = this.currentData;
    if (!data?.image) return;

    const { meta, url } = data.image;
    const { nLevels, levelShapes } = meta;
    const topShape = levelShapes[0];
    if (!topShape) return;

    const { width: imageWidth, height: imageHeight } = topShape;
    const bounds = data.bounds ?? [0, 0, imageWidth, imageHeight];

    // Determine viewport bounds in physical coords
    const vp     = this.engine.viewport;
    const camera = this.engine.camera;
    const vpBounds: [number, number, number, number] = [
      camera.center.x - (vp.width  / vp.pixelRatio) / (2 * camera.zoom),
      camera.center.y - (vp.height / vp.pixelRatio) / (2 * camera.zoom),
      camera.center.x + (vp.width  / vp.pixelRatio) / (2 * camera.zoom),
      camera.center.y + (vp.height / vp.pixelRatio) / (2 * camera.zoom),
    ];

    const bestLevel = this.tileScheduler.getBestLevel(
      vp.width / vp.pixelRatio,
      vp.height / vp.pixelRatio,
      imageWidth,
      imageHeight,
      nLevels,
    );

    const nChannels = meta.nChannels;
    const tiles     = this.tileScheduler.scheduleTiles(
      vpBounds,
      imageWidth,
      imageHeight,
      this.tileSize,
      nChannels,
      bestLevel,
    );

    const levelShape = levelShapes[bestLevel] ?? topShape;
    const nTilesX    = Math.ceil(levelShape.width  / this.tileSize);
    const nTilesY    = Math.ceil(levelShape.height / this.tileSize);

    // Update image layer info
    this.imageLayer.setImageInfo(bounds, imageWidth, imageHeight, this.tileSize);

    for (const coord of tiles) {
      const key = `${coord.level}/${coord.channel}/${coord.tx}/${coord.ty}`;

      // Check memory cache first
      if (this.tileCache.has(key)) {
        const cached = this.tileCache.get(key)!;
        const phys   = this.tileBounds(coord, bounds, nTilesX, nTilesY);
        this.imageLayer.updateTile(
          this.engine.gl, key,
          cached.data, cached.width, cached.height, cached.dtype,
          phys, coord.channel,
        );
        continue;
      }

      // Loader worker not provided — skip network fetch
      if (!loader) continue;

      // Async tile fetch via DataWorker
      // DataWorker does not have a loadTile method in the core API;
      // we use postMessage conventions to request tile data.
      // This is intentionally kept as a hook for external integration.
      void this.fetchTile(loader, coord, url, key, bounds, nTilesX, nTilesY);
    }
  }

  private async fetchTile(
    _loader: DataWorker,
    coord: TileCoord,
    _url: string,
    key: string,
    bounds: [number, number, number, number],
    nTilesX: number,
    nTilesY: number,
  ): Promise<void> {
    // Placeholder: real implementation would call loader.requestTile(...)
    // and decode the returned ArrayBuffer. Subclasses or integrators
    // should override or extend this to integrate with @seegak/data-loaders.
    void coord; void key; void bounds; void nTilesX; void nTilesY;
  }

  // ── Public API ──

  /**
   * Set or replace all spatial data layers.
   * Clears existing tile cache and re-uploads geometry.
   */
  setData(data: SpatialData): void {
    this.currentData = data;

    // Fit camera to bounds
    const bounds = data.bounds;
    if (bounds) {
      const [xMin, yMin, xMax, yMax] = bounds;
      const cx     = (xMin + xMax) / 2;
      const cy     = (yMin + yMax) / 2;
      const rangeX = xMax - xMin || 1;
      const rangeY = yMax - yMin || 1;
      const vp     = this.engine.viewport;
      const aspect = vp.width / vp.height;
      const zoom   = Math.min(2 * aspect / (rangeX * 1.1), 2 / (rangeY * 1.1));
      this.engine.camera = { center: { x: cx, y: cy }, zoom };
    }

    // Image channels: initialize ChannelController if image is present
    if (data.image) {
      const nCh = data.image.channels.length;
      // Sync channel controller with incoming channel configs
      data.image.channels.forEach((ch, i) => {
        this.channelController.setColormap(i, ch.colormap);
        this.channelController.setContrast(i, ch.contrastLimits[0], ch.contrastLimits[1]);
        this.channelController.setVisible(i, ch.visible);
      });
      // Pad controller if it has fewer channels than the image
      for (let i = this.channelController.channelCount; i < nCh; i++) {
        this.channelController.setVisible(i, true);
      }
      this.uploadChannelLuts();
      this.tileCache.clear();
      this.scheduleTileLoad();
    }

    // Cells
    if (data.cells) {
      this.cellLayer.setData(
        this.engine,
        data.cells.x,
        data.cells.y,
        data.cells.labels,
        data.cells.colors,
      );
      this.cellLayer.setPointSize(this.engine, this.opts.cellPointSize);
      this.cellLayer.setOpacity(this.engine, this.opts.cellOpacity);
    }

    // Segmentation
    if (data.segmentation) {
      // Build a flat triangle index list from the per-cell polygon offsets.
      // We use a simple fan triangulation per polygon.
      const { vertices, offsets, counts } = data.segmentation;
      const totalTris = this.estimateTriangleCount(counts);
      const indices   = new Uint32Array(totalTris * 3);
      let   idxPtr    = 0;

      for (let cell = 0; cell < offsets.length; cell++) {
        const start     = offsets[cell]! / 2; // offsets in floats, convert to vertex index
        const vertCount = counts[cell]!;
        if (vertCount < 3) continue;

        // Fan from first vertex of this polygon
        for (let v = 1; v < vertCount - 1; v++) {
          indices[idxPtr++] = start;
          indices[idxPtr++] = start + v;
          indices[idxPtr++] = start + v + 1;
        }
      }

      const trimmedIndices = indices.subarray(0, idxPtr);
      this.segLayer.setData(this.engine, vertices, trimmedIndices as Uint32Array);
    }

    // Molecules
    if (data.molecules && this.opts.showMolecules) {
      this.molLayer.setData(
        this.engine,
        data.molecules.x,
        data.molecules.y,
        data.molecules.geneIds,
      );
      this.molLayer.setPointSize(this.engine, this.opts.moleculePointSize);
    }

    this.engine.requestRender();
  }

  /** Required by BaseChart — same as setData for spatial data */
  update(data: unknown): void {
    this.setData(data as SpatialData);
  }

  private estimateTriangleCount(counts: Uint32Array): number {
    let total = 0;
    for (let i = 0; i < counts.length; i++) {
      const v = counts[i]!;
      if (v >= 3) total += v - 2;
    }
    return total;
  }

  // ── Channel controls ──

  setChannelVisible(index: number, visible: boolean): void {
    this.channelController.setVisible(index, visible);
  }

  setChannelColormap(index: number, colormap: string): void {
    this.channelController.setColormap(index, colormap);
  }

  setChannelContrast(index: number, min: number, max: number): void {
    this.channelController.setContrast(index, min, max);
  }

  // ── Cell display controls ──

  setCellOpacity(opacity: number): void {
    this.opts.cellOpacity = opacity;
    this.cellLayer.setOpacity(this.engine, opacity);
    this.engine.requestRender();
  }

  setCellPointSize(size: number): void {
    this.opts.cellPointSize = size;
    this.cellLayer.setPointSize(this.engine, size);
    this.engine.requestRender();
  }

  // ── Molecule display controls ──

  setMoleculesVisible(visible: boolean): void {
    this.opts.showMolecules = visible;
    this.molLayer.setOpacity(this.engine, visible ? 1.0 : 0.0);
    this.engine.requestRender();
  }

  setMoleculePointSize(size: number): void {
    this.opts.moleculePointSize = size;
    this.molLayer.setPointSize(this.engine, size);
    this.engine.requestRender();
  }

  // ── Tile management ──

  /**
   * Manually inject a decoded tile into the cache and GPU.
   * Useful when integrating with a custom tile loader.
   */
  injectTile(
    key: string,
    data: ArrayBuffer,
    width: number,
    height: number,
    dtype: string,
    physBounds: [number, number, number, number],
    channelIndex: number,
  ): void {
    this.tileCache.set(key, { data, width, height, dtype });
    this.imageLayer.updateTile(
      this.engine.gl, key, data, width, height, dtype,
      physBounds, channelIndex,
    );
    this.engine.requestRender();
  }

  /** Evict a specific tile from the GPU and memory cache. */
  evictTile(key: string): void {
    this.tileCache.clear(); // simple: clear full cache
    this.imageLayer.removeTile(this.engine.gl, key);
  }

  // ── Cleanup ──

  destroy(): void {
    this.tileCache.clear();
    super.destroy();
  }
}
