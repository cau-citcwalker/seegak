import type { CoordinationScope, CoordinationSpec } from './types.js';

/** Callback invoked whenever a coordinated value changes. */
type Listener<T> = (value: T) => void;

/**
 * Central in-memory store for all coordination state.
 *
 * Maintains a map of `type → scope → value` and a parallel
 * `type → scope → Set<listener>` for reactive subscriptions.
 *
 * @example
 * ```ts
 * const space = new CoordinationSpace();
 * space.set('embeddingType', 'default', 'UMAP');
 *
 * const unsub = space.subscribe('embeddingType', 'default', (v) => {
 *   console.log('embedding changed to', v);
 * });
 *
 * space.set('embeddingType', 'default', 'PCA'); // triggers the listener
 * unsub(); // remove the listener
 * ```
 */
export class CoordinationSpace {
  /**
   * Stored coordination values.
   * Outer key: coordination type name.
   * Inner key: scope name.
   */
  private readonly values: Map<string, Map<CoordinationScope, unknown>> = new Map();

  /**
   * Registered listeners per type and scope.
   * Outer key: coordination type name.
   * Inner key: scope name.
   * Value: set of listener functions.
   */
  private readonly listeners: Map<string, Map<CoordinationScope, Set<Listener<unknown>>>> =
    new Map();

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  private ensureTypeMap<V>(
    store: Map<string, Map<CoordinationScope, V>>,
    type: string,
  ): Map<CoordinationScope, V> {
    let scopeMap = store.get(type);
    if (scopeMap === undefined) {
      scopeMap = new Map<CoordinationScope, V>();
      store.set(type, scopeMap);
    }
    return scopeMap;
  }

  private getScopeListeners(type: string, scope: CoordinationScope): Set<Listener<unknown>> {
    const scopeMap = this.ensureTypeMap(this.listeners, type);
    let listenerSet = scopeMap.get(scope);
    if (listenerSet === undefined) {
      listenerSet = new Set<Listener<unknown>>();
      scopeMap.set(scope, listenerSet);
    }
    return listenerSet;
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Subscribe to value changes for a given coordination type and scope.
   *
   * The listener is called immediately with the current value (if any exists),
   * and then again on every subsequent {@link set} call for the same type/scope.
   *
   * @returns A no-arg unsubscribe function. Call it to remove the listener.
   */
  subscribe<T>(type: string, scope: CoordinationScope, listener: Listener<T>): () => void {
    const listenerSet = this.getScopeListeners(type, scope);
    const typedListener = listener as Listener<unknown>;
    listenerSet.add(typedListener);

    // Immediately emit the current value so the subscriber can initialise.
    const current = this.get<T>(type, scope);
    if (current !== undefined) {
      listener(current);
    }

    return () => {
      listenerSet.delete(typedListener);
    };
  }

  /**
   * Set a coordination value and synchronously notify all current listeners
   * for that type/scope combination.
   */
  set<T>(type: string, scope: CoordinationScope, value: T): void {
    const scopeMap = this.ensureTypeMap(this.values, type);
    scopeMap.set(scope, value);

    // Notify listeners if any exist for this type/scope.
    const listenerSetEntry = this.listeners.get(type)?.get(scope);
    if (listenerSetEntry !== undefined) {
      for (const listener of listenerSetEntry) {
        listener(value);
      }
    }
  }

  /**
   * Retrieve the current value for a coordination type and scope.
   * Returns `undefined` when the type/scope has not been initialised.
   */
  get<T>(type: string, scope: CoordinationScope): T | undefined {
    return this.values.get(type)?.get(scope) as T | undefined;
  }

  /**
   * Like {@link get}, but returns `defaultValue` instead of `undefined`
   * when the type/scope has no stored value.
   */
  getOrDefault<T>(type: string, scope: CoordinationScope, defaultValue: T): T {
    const value = this.get<T>(type, scope);
    return value !== undefined ? value : defaultValue;
  }

  /**
   * Bulk-initialise coordination values from a {@link CoordinationSpec}.
   *
   * Iterates over every `type → scope → value` entry in
   * `spec.coordinationSpace` and calls {@link set} for each, which will
   * notify any pre-existing subscribers.
   */
  initFromSpec(spec: CoordinationSpec): void {
    for (const [type, scopeMap] of Object.entries(spec.coordinationSpace)) {
      for (const [scope, value] of Object.entries(scopeMap)) {
        this.set(type, scope, value);
      }
    }
  }

  /**
   * Serialize the current coordination state into a partial
   * {@link CoordinationSpec} containing only the `coordinationSpace`.
   *
   * The returned object omits `version`, `viewCoordination`, and `layout`
   * because those are owned by the spec builder / host application.
   */
  toSpec(): Partial<CoordinationSpec> {
    const coordinationSpace: Record<string, Record<CoordinationScope, unknown>> = {};

    for (const [type, scopeMap] of this.values) {
      const scopes: Record<CoordinationScope, unknown> = {};
      for (const [scope, value] of scopeMap) {
        scopes[scope] = value;
      }
      coordinationSpace[type] = scopes;
    }

    return { coordinationSpace };
  }
}
