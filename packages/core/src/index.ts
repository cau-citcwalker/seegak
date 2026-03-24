// Types
export type {
  Vec2, Vec4, Rect, Viewport, Camera, RenderState,
  BufferDescriptor, AttributeLayout,
  ShaderSource, UniformValue,
  ColorScale,
  InteractionEvent, HitTestResult,
} from './types.js';

// Renderer
export { RenderEngine } from './renderer/render-engine.js';
export type { RenderLayer } from './renderer/render-engine.js';
export { ShaderProgram } from './renderer/shader.js';
export { BufferManager } from './renderer/buffer-manager.js';
export { TextureManager } from './renderer/texture-manager.js';
export { InteractionHandler } from './renderer/interaction-handler.js';
export type { InteractionCallback } from './renderer/interaction-handler.js';
export { TextRenderer } from './renderer/text-renderer.js';

// Axis
export { AxisBuilder, AxisLayer, generateTicks } from './renderer/axis-renderer.js';
export type { AxisConfig, AxesConfig } from './renderer/axis-renderer.js';

// Legend
export { LegendRenderer, ColorBarRenderer } from './renderer/legend-renderer.js';
export type { LegendItem, LegendOptions, ColorBarOptions } from './renderer/legend-renderer.js';

// LOD
export { LODManager } from './renderer/lod-manager.js';
export type { LODLevel } from './renderer/lod-manager.js';

// Animation
export { Animator, Easing } from './renderer/animator.js';
export type { AnimationOptions, EasingFn } from './renderer/animator.js';

// Accessibility
export { AccessibilityManager } from './renderer/accessibility.js';
export type { A11yOptions, DataPointA11y } from './renderer/accessibility.js';

// Tooltip
export { Tooltip, throttle } from './renderer/tooltip.js';
export type { TooltipContent, TooltipRow, TooltipOptions } from './renderer/tooltip.js';

// Toolbar & Annotation
export { ChartToolbar } from './renderer/chart-toolbar.js';
export type { ToolType, ActionType, ToolPreset, ChartToolbarOptions } from './renderer/chart-toolbar.js';
export { AnnotationOverlay } from './renderer/annotation-overlay.js';
export type { SelectionEvent, BoxSelectEvent, LassoSelectEvent } from './renderer/annotation-overlay.js';

// Spatial Index
export { SpatialIndex } from './utils/spatial-index.js';
export type { SpatialIndexOptions } from './utils/spatial-index.js';

// Export
export { exportChart, exportToPNG, exportToSVG, exportCSV, downloadBlob, downloadSVG } from './renderer/exporter.js';
export type { ExportOptions, CsvColumn } from './renderer/exporter.js';

// Download Modal
export { DownloadModal } from './renderer/download-modal.js';
export type { DownloadOption } from './renderer/download-modal.js';

// Worker
export { DataWorker } from './worker/data-worker.js';
export type { WorkerRequest, WorkerResponse } from './worker/data-worker-protocol.js';

// Utils
export {
  vec2, vec4, addVec2, subVec2, scaleVec2, lenVec2, distVec2,
  rect, containsPoint, intersects,
  screenToWorld, worldToScreen,
  ortho, cameraMatrix,
  hexToVec4, vec4ToHex,
  clamp, lerp, remap,
} from './utils/math.js';

export {
  sampleColorScale, colorScaleToTexture,
  VIRIDIS, PLASMA, INFERNO,
} from './utils/color-scales.js';
