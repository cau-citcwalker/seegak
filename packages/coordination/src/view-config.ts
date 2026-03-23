import type { CoordinationScope, CoordinationSpec, LayoutItem } from './types.js';

/**
 * Fluent builder for constructing a valid {@link CoordinationSpec} object.
 *
 * All mutation methods return `this` to support chaining.
 *
 * @example
 * ```ts
 * const spec = new ViewConfigBuilder()
 *   .addDataset('cells', { url: '/api/cells' })
 *   .setCoordination('embeddingType', 'default', 'UMAP')
 *   .addView('scatterplot', { embeddingType: 'default', dataset: 'A' }, { x: 0, y: 0, w: 6, h: 6 })
 *   .build();
 * ```
 */
export class ViewConfigBuilder {
  private readonly version: string;

  /**
   * Coordination space: type → scope → value.
   * Built incrementally by {@link setCoordination}.
   */
  private readonly coordinationSpace: Record<string, Record<CoordinationScope, unknown>> = {};

  /**
   * View coordination declarations: view key → scopes map.
   * Built incrementally by {@link addView}.
   */
  private readonly viewCoordination: Record<
    string,
    { coordinationScopes?: Record<string, CoordinationScope> }
  > = {};

  /**
   * Ordered list of layout items.
   * Built incrementally by {@link addView}.
   */
  private readonly layout: LayoutItem[] = [];

  /**
   * Counter used to generate unique view keys when multiple views
   * share the same component name.
   */
  private readonly viewCounts: Record<string, number> = {};

  /**
   * @param version Spec format version string. Defaults to `'1.0.0'`.
   */
  constructor(version = '1.0.0') {
    this.version = version;
  }

  /**
   * Register a dataset in the coordination space under the `'dataset'` type.
   *
   * The dataset is stored as a scope in `coordinationSpace.dataset` so that
   * views can reference it via {@link addView}.
   *
   * @param datasetId Unique identifier for this dataset.
   * @param props     Optional metadata / connection props stored as the scope value.
   * @returns `this` for chaining.
   */
  addDataset(datasetId: string, props: Record<string, unknown> = {}): this {
    this.setCoordination('dataset', datasetId, { id: datasetId, ...props });
    return this;
  }

  /**
   * Add a view panel to the layout.
   *
   * A stable view key is derived from the component name and an auto-incremented
   * counter (e.g. `"scatterplot-0"`, `"scatterplot-1"`).
   *
   * @param component    Name of the registered view plugin component.
   * @param coordScopes  Map of coordination type → scope name for this view.
   * @param layout       Grid position and size `{ x, y, w, h }`.
   * @param props        Optional static props forwarded to the component.
   * @returns `this` for chaining.
   */
  addView(
    component: string,
    coordScopes: Record<string, string>,
    layout: { x: number; y: number; w: number; h: number },
    props: Record<string, unknown> = {},
  ): this {
    const count = this.viewCounts[component] ?? 0;
    this.viewCounts[component] = count + 1;
    const viewKey = `${component}-${count}`;

    this.layout.push({
      component,
      props: Object.keys(props).length > 0 ? props : undefined,
      coordinationScopes: coordScopes,
      ...layout,
    });

    this.viewCoordination[viewKey] = { coordinationScopes: coordScopes };

    return this;
  }

  /**
   * Set a single coordination value in the coordination space.
   *
   * Calling this multiple times with the same `type` and `scope` will
   * overwrite the previous value.
   *
   * @param type  Coordination type name (see {@link COORDINATION_TYPES}).
   * @param scope Scope name (e.g. `'default'`).
   * @param value The initial value to store.
   * @returns `this` for chaining.
   */
  setCoordination(type: string, scope: string, value: unknown): this {
    if (this.coordinationSpace[type] === undefined) {
      this.coordinationSpace[type] = {};
    }
    // Non-null assertion is safe: we just initialised above.
    this.coordinationSpace[type]![scope] = value;
    return this;
  }

  /**
   * Finalise the builder and return an immutable {@link CoordinationSpec}.
   *
   * The returned object is a deep-enough copy that subsequent builder
   * mutations will not affect it.
   */
  build(): CoordinationSpec {
    // Deep-copy mutable internals so the caller cannot mutate the result
    // through the builder or vice-versa.
    const coordinationSpace: Record<string, Record<CoordinationScope, unknown>> = {};
    for (const [type, scopes] of Object.entries(this.coordinationSpace)) {
      coordinationSpace[type] = { ...scopes };
    }

    const viewCoordination: Record<
      string,
      { coordinationScopes?: Record<string, CoordinationScope> }
    > = {};
    for (const [viewKey, entry] of Object.entries(this.viewCoordination)) {
      viewCoordination[viewKey] = {
        coordinationScopes: entry.coordinationScopes ? { ...entry.coordinationScopes } : undefined,
      };
    }

    const layout: LayoutItem[] = this.layout.map((item) => ({
      ...item,
      props: item.props ? { ...item.props } : undefined,
      coordinationScopes: item.coordinationScopes ? { ...item.coordinationScopes } : undefined,
    }));

    return {
      version: this.version,
      coordinationSpace,
      viewCoordination,
      layout,
    };
  }
}
