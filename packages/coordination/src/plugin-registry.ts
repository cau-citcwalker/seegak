/**
 * Descriptor for a view plugin that can be registered with the
 * {@link PluginRegistry}.
 *
 * The `component` field is intentionally typed as `unknown` so that the
 * coordination package remains renderer-agnostic — React components, web
 * components, plain factory functions, or any other renderable can be stored
 * here without introducing a rendering dependency.
 */
export interface ViewPlugin {
  /** Unique name used to reference this plugin from a layout spec. */
  name: string;
  /**
   * Coordination type names that this plugin reads or writes.
   * Used for tooling, documentation generation, and validation.
   */
  coordinationTypes: string[];
  /**
   * Optional renderer-specific component or factory.
   * The coordination layer never inspects this value.
   */
  component?: unknown;
}

/**
 * A simple name-keyed registry for {@link ViewPlugin} descriptors.
 *
 * @example
 * ```ts
 * import { globalRegistry } from '@seegak/coordination';
 *
 * globalRegistry.register({
 *   name: 'scatterplot',
 *   coordinationTypes: ['embeddingType', 'obssetSelection'],
 *   component: ScatterplotComponent,
 * });
 *
 * const plugin = globalRegistry.get('scatterplot');
 * ```
 */
export class PluginRegistry {
  private readonly plugins: Map<string, ViewPlugin> = new Map();

  /**
   * Register a plugin.
   *
   * @throws {Error} When a plugin with the same name has already been registered.
   */
  register(plugin: ViewPlugin): void {
    if (this.plugins.has(plugin.name)) {
      throw new Error(
        `PluginRegistry: a plugin named "${plugin.name}" is already registered. ` +
          `Call registry.get("${plugin.name}") to retrieve it or use a unique name.`,
      );
    }
    this.plugins.set(plugin.name, plugin);
  }

  /**
   * Retrieve a registered plugin by name.
   * Returns `undefined` when no plugin with that name has been registered.
   */
  get(name: string): ViewPlugin | undefined {
    return this.plugins.get(name);
  }

  /**
   * Check whether a plugin with the given name is registered.
   */
  has(name: string): boolean {
    return this.plugins.has(name);
  }

  /**
   * Return an array of all registered plugins in insertion order.
   */
  list(): ViewPlugin[] {
    return Array.from(this.plugins.values());
  }
}

/**
 * The default application-wide plugin registry.
 *
 * Import and use this instance unless you need an isolated registry
 * (e.g., for testing or sandboxed sub-applications).
 */
export const globalRegistry = new PluginRegistry();
