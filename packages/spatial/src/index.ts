// ─── Main View ───
export { SpatialView } from './spatial-view.js';
export type { SpatialViewOptions } from './spatial-view.js';

// ─── Channel ───
export { ChannelController } from './channel/channel-controller.js';
export type { ChannelState } from './channel/channel-controller.js';

// ─── Tile ───
export { TileCache } from './tile/tile-cache.js';
export type { TileData } from './tile/tile-cache.js';

export { TileScheduler } from './tile/tile-scheduler.js';
export type { TileCoord } from './tile/tile-scheduler.js';

// ─── Types ───
export type {
  ChannelConfig,
  SpatialCells,
  SpatialImage,
  SpatialMolecules,
  SpatialSegmentation,
  SpatialData,
} from './types.js';
