/**
 * A string identifier representing a named coordination scope.
 * Multiple views can share the same scope to synchronize a coordination type.
 */
export type CoordinationScope = string;

/**
 * A single item in the layout grid describing one view panel.
 */
export interface LayoutItem {
  /** The registered view plugin component name. */
  component: string;
  /** Optional static props passed directly to the component. */
  props?: Record<string, unknown>;
  /** Map from coordination type name to the scope name used by this view. */
  coordinationScopes?: Record<string, CoordinationScope>;
  /** Grid column start (0-indexed). */
  x: number;
  /** Grid row start (0-indexed). */
  y: number;
  /** Width in grid columns. */
  w: number;
  /** Height in grid rows. */
  h: number;
}

/**
 * The top-level JSON configuration object for a Seegak visualization.
 *
 * @example
 * ```json
 * {
 *   "version": "1.0.0",
 *   "coordinationSpace": {
 *     "embeddingType": { "default": "UMAP" }
 *   },
 *   "viewCoordination": {
 *     "scatterplot": { "coordinationScopes": { "embeddingType": "default" } }
 *   },
 *   "layout": [{ "component": "scatterplot", "x": 0, "y": 0, "w": 6, "h": 6 }]
 * }
 * ```
 */
export interface CoordinationSpec {
  /**
   * Spec format version, used for future migration support.
   * @example "1.0.0"
   */
  version: string;
  /**
   * Nested map of coordination type → scope name → initial value.
   * @example { "embeddingType": { "default": "UMAP" } }
   */
  coordinationSpace: Record<string, Record<CoordinationScope, unknown>>;
  /**
   * Per-view scope assignments: view key → coordination type → scope name.
   * @example { "scatter": { "coordinationScopes": { "embeddingType": "default" } } }
   */
  viewCoordination: Record<string, { coordinationScopes?: Record<string, CoordinationScope> }>;
  /** Ordered array of view layout descriptors. */
  layout: LayoutItem[];
}

/**
 * Canonical coordination type name constants.
 * Use these instead of raw strings to avoid typos and enable autocomplete.
 */
export const COORDINATION_TYPES = {
  /** Selected observation set (e.g. cluster or cell group). */
  OBSSET_SELECTION: 'obssetSelection',
  /** Currently selected feature / gene. */
  FEATURE_SELECTION: 'featureSelection',
  /** Dimensionality-reduction embedding to display (e.g. "UMAP", "PCA"). */
  EMBEDDING_TYPE: 'embeddingType',
  /** Zoom level for the spatial view. */
  SPATIAL_ZOOM: 'spatialZoom',
  /** Pan / target coordinates [x, y] for the spatial view. */
  SPATIAL_TARGET: 'spatialTarget',
  /** Visibility flag per image channel. */
  CHANNEL_VISIBILITY: 'channelVisibility',
  /** Colormap name per image channel. */
  CHANNEL_COLORMAPS: 'channelColormaps',
  /** Strategy used to color individual cells (e.g. "geneExpression", "cellType"). */
  CELL_COLOR_ENCODING: 'cellColorEncoding',
  /** Gating polygon / selection in a scatter plot. */
  GATING_SELECTION: 'gatingSelection',
  /** Active dataset identifier. */
  DATASET: 'dataset',
} as const;

/**
 * Type guard that validates whether an arbitrary object satisfies
 * the {@link CoordinationSpec} shape well enough to be used safely.
 *
 * Checks:
 * - `version` is a non-empty string
 * - `coordinationSpace` is a plain object
 * - `viewCoordination` is a plain object
 * - `layout` is an array
 */
export function isValidSpec(obj: unknown): obj is CoordinationSpec {
  if (obj === null || typeof obj !== 'object') {
    return false;
  }

  const record = obj as Record<string, unknown>;

  if (typeof record['version'] !== 'string' || record['version'].length === 0) {
    return false;
  }

  if (
    record['coordinationSpace'] === null ||
    typeof record['coordinationSpace'] !== 'object' ||
    Array.isArray(record['coordinationSpace'])
  ) {
    return false;
  }

  if (
    record['viewCoordination'] === null ||
    typeof record['viewCoordination'] !== 'object' ||
    Array.isArray(record['viewCoordination'])
  ) {
    return false;
  }

  if (!Array.isArray(record['layout'])) {
    return false;
  }

  return true;
}
