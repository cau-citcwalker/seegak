/**
 * @seegak/coordination
 *
 * Zero-rendering, zero-WebGL package that provides:
 * - Shared TypeScript types and coordination type constants ({@link COORDINATION_TYPES})
 * - JSON configuration schema and type guard ({@link CoordinationSpec}, {@link isValidSpec})
 * - In-memory coordination state store ({@link CoordinationSpace})
 * - Fluent spec builder ({@link ViewConfigBuilder})
 * - Plugin registry ({@link PluginRegistry}, {@link globalRegistry})
 */

export type { CoordinationScope, CoordinationSpec, LayoutItem } from './types.js';
export { COORDINATION_TYPES, isValidSpec } from './types.js';

export { CoordinationSpace } from './coordinator.js';

export type { ViewPlugin } from './plugin-registry.js';
export { PluginRegistry, globalRegistry } from './plugin-registry.js';

export { ViewConfigBuilder } from './view-config.js';
