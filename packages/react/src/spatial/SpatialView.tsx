import { forwardRef, useEffect, useImperativeHandle } from 'react';
import {
  SpatialView as SpatialViewCore,
  type SpatialViewOptions, type SpatialData,
} from '@seegak/spatial';
import type { ChannelController } from '@seegak/spatial';
import type { TileResponse } from '@seegak/data-loaders';
import { useChart } from '../use-chart.js';

export type { TileResponse };

export interface SpatialViewProps extends SpatialViewOptions {
  data?: SpatialData | null;
  /**
   * Optional custom tile loader. When provided, the component will call this
   * function for each required tile and inject the result into the view.
   * Signature: (level, channel, tx, ty) => Promise<TileResponse>
   */
  onTileRequest?: (level: number, channel: number, tx: number, ty: number) => Promise<TileResponse>;
  style?: React.CSSProperties;
  className?: string;
}

export interface SpatialViewHandle {
  setData(data: SpatialData): void;
  getChannelController(): ChannelController | null;
  getChart(): SpatialViewCore | null;
}

export const SpatialView = forwardRef<SpatialViewHandle, SpatialViewProps>(
  function SpatialView({
    data,
    channels, cellOpacity, cellPointSize,
    showMolecules, moleculePointSize,
    tileSize, maxTileCache,
    onClickCell, onSelectCells,
    onTileRequest,
    style, className,
    ...rest
  }, ref) {
    const { containerRef, chartRef } = useChart<SpatialViewCore, SpatialData>(
      SpatialViewCore,
      null,
      {
        channels, cellOpacity, cellPointSize,
        showMolecules, moleculePointSize,
        tileSize, maxTileCache,
        onClickCell, onSelectCells,
        ...rest,
      } as unknown as Record<string, unknown>,
    );

    useEffect(() => {
      if (!chartRef.current || data == null) return;
      chartRef.current.setData(data);
    // chartRef is a stable mutable ref, excluded intentionally
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [data]);

    // Wire up custom tile request handler
    useEffect(() => {
      if (!chartRef.current || !onTileRequest || !data?.image) return;
      const view = chartRef.current;
      const { meta, url } = data.image;
      const { nLevels, levelShapes } = meta;
      const tSize = tileSize ?? 256;

      // Iterate over all possible tiles for all levels and channels at the
      // current viewport and inject them asynchronously.
      const inject = async (): Promise<void> => {
        for (let level = 0; level < nLevels; level++) {
          const shape = levelShapes[level];
          if (!shape) continue;
          const nTilesX = Math.ceil(shape.width / tSize);
          const nTilesY = Math.ceil(shape.height / tSize);
          const nChannels = meta.nChannels;
          for (let ch = 0; ch < nChannels; ch++) {
            for (let tx = 0; tx < nTilesX; tx++) {
              for (let ty = 0; ty < nTilesY; ty++) {
                try {
                  const tile = await onTileRequest(level, ch, tx, ty);
                  const bounds = data.bounds ?? [0, 0, shape.width, shape.height];
                  const [xMin, yMin, xMax, yMax] = bounds;
                  const tileW = (xMax - xMin) / nTilesX;
                  const tileH = (yMax - yMin) / nTilesY;
                  const physBounds: [number, number, number, number] = [
                    xMin + tx * tileW,
                    yMin + ty * tileH,
                    xMin + (tx + 1) * tileW,
                    yMin + (ty + 1) * tileH,
                  ];
                  const key = `${level}/${ch}/${tx}/${ty}`;
                  const rawBuffer: ArrayBuffer =
                    tile.data instanceof ArrayBuffer
                      ? tile.data
                      : (tile.data.buffer as ArrayBuffer);
                  view.injectTile(
                    key,
                    rawBuffer,
                    tile.width,
                    tile.height,
                    tile.dtype,
                    physBounds,
                    ch,
                  );
                } catch {
                  // Individual tile failures are non-fatal
                }
              }
            }
          }
        }
      };

      void inject();
    // We intentionally re-run only when data or onTileRequest changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [data, onTileRequest]);

    useImperativeHandle(ref, () => ({
      setData(d: SpatialData) {
        chartRef.current?.setData(d);
      },
      getChannelController() {
        return chartRef.current?.channelController ?? null;
      },
      getChart() {
        return chartRef.current;
      },
    }));

    return (
      <div
        ref={containerRef}
        className={className}
        style={{ width: '100%', height: '100%', ...style }}
      />
    );
  },
);
