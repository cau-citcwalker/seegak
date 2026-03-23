export interface TileCoord {
  level: number;
  channel: number;
  tx: number;
  ty: number;
}

/**
 * TileScheduler computes which tiles are needed for the current viewport
 * and orders them by priority (center-out, then coarser-to-finer).
 */
export class TileScheduler {
  /**
   * Given viewport bounds in physical coordinates, returns all tile coordinates
   * that intersect the visible area at the given pyramid level, for all channels.
   * Tiles are sorted by distance from viewport center (closest first).
   *
   * @param viewportBounds - [xMin, yMin, xMax, yMax] in physical coords
   * @param imageWidth     - full-resolution image width in pixels
   * @param imageHeight    - full-resolution image height in pixels
   * @param tileSize       - tile size in pixels (e.g. 256)
   * @param nChannels      - number of channels to schedule
   * @param currentLevel   - pyramid level (0 = full resolution)
   */
  scheduleTiles(
    viewportBounds: [number, number, number, number],
    imageWidth: number,
    imageHeight: number,
    tileSize: number,
    nChannels: number,
    currentLevel: number,
  ): TileCoord[] {
    const [vpXMin, vpYMin, vpXMax, vpYMax] = viewportBounds;

    // Scale factor at this pyramid level (level 0 = 1x, level 1 = 0.5x, ...)
    const scale = Math.pow(0.5, currentLevel);
    const levelWidth  = Math.ceil(imageWidth  * scale);
    const levelHeight = Math.ceil(imageHeight * scale);

    // Number of tiles in each dimension at this level
    const nTilesX = Math.ceil(levelWidth  / tileSize);
    const nTilesY = Math.ceil(levelHeight / tileSize);

    // Physical size of each tile
    const tilePhysW = imageWidth  / nTilesX;
    const tilePhysH = imageHeight / nTilesY;

    // Viewport center in tile units (for priority sorting)
    const vpCenterX = (vpXMin + vpXMax) / 2 / tilePhysW;
    const vpCenterY = (vpYMin + vpYMax) / 2 / tilePhysH;

    // Tile range intersecting the viewport
    const txMin = Math.max(0, Math.floor(vpXMin / tilePhysW));
    const tyMin = Math.max(0, Math.floor(vpYMin / tilePhysH));
    const txMax = Math.min(nTilesX - 1, Math.floor(vpXMax / tilePhysW));
    const tyMax = Math.min(nTilesY - 1, Math.floor(vpYMax / tilePhysH));

    const tiles: TileCoord[] = [];

    for (let channel = 0; channel < nChannels; channel++) {
      for (let ty = tyMin; ty <= tyMax; ty++) {
        for (let tx = txMin; tx <= txMax; tx++) {
          tiles.push({ level: currentLevel, channel, tx, ty });
        }
      }
    }

    // Sort by distance from viewport center (closest tiles rendered first)
    tiles.sort((a, b) => {
      const da = Math.hypot(a.tx + 0.5 - vpCenterX, a.ty + 0.5 - vpCenterY);
      const db = Math.hypot(b.tx + 0.5 - vpCenterX, b.ty + 0.5 - vpCenterY);
      // Secondary: sort by channel index for determinism
      if (da !== db) return da - db;
      return a.channel - b.channel;
    });

    return tiles;
  }

  /**
   * Choose the best pyramid level for the current viewport.
   * Picks the coarsest level whose native pixel size is at least as fine
   * as the screen pixel size, so tiles never appear blurry.
   *
   * @param viewportWidth  - canvas CSS pixel width
   * @param viewportHeight - canvas CSS pixel height
   * @param imageWidth     - full-resolution image width
   * @param imageHeight    - full-resolution image height
   * @param nLevels        - total number of pyramid levels available
   */
  getBestLevel(
    viewportWidth: number,
    viewportHeight: number,
    imageWidth: number,
    imageHeight: number,
    nLevels: number,
  ): number {
    if (nLevels <= 1) return 0;

    // Ratio of image pixels to screen pixels
    const scaleX = imageWidth  / viewportWidth;
    const scaleY = imageHeight / viewportHeight;
    const scale  = Math.max(scaleX, scaleY);

    // Find the coarsest level whose downscale factor is <= scale
    // Level L has downscale 2^L
    const idealLevel = Math.floor(Math.log2(scale));
    return Math.max(0, Math.min(nLevels - 1, idealLevel));
  }
}
