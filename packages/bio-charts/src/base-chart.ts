import {
  RenderEngine, InteractionHandler, TextRenderer,
  ChartToolbar, AnnotationOverlay,
  exportToPNG, exportToSVG, downloadBlob, downloadSVG,
  type Camera, type Viewport,
  type ToolType, type ActionType, type ToolPreset,
  type ChartToolbarOptions, type SelectionEvent,
  type ExportOptions,
} from '@seegak/core';

export interface ChartMargin {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface BaseChartOptions {
  margin?: Partial<ChartMargin>;
  backgroundColor?: string;
  interactive?: boolean;
  /** Show the tool toolbar. Default: true */
  toolbar?: boolean;
  /**
   * Toolbar preset: 'full' | 'standard' | 'minimal'.
   * - full: all tools + save PNG/SVG
   * - standard: pan, box-select, lasso, eraser + save PNG (default)
   * - minimal: pan only
   * Or omit and set tools/actions manually.
   */
  toolbarPreset?: ToolPreset;
  /** Initial active tool. Default: 'pan' */
  defaultTool?: ToolType;
  /** Which tools to show in the toolbar (ignored when toolbarPreset is set) */
  tools?: ToolType[];
  /** Which action buttons to show (ignored when toolbarPreset is set) */
  actions?: ActionType[];
  /** Called when a box or lasso selection completes */
  onSelect?: (event: SelectionEvent) => void;
  /**
   * Show axis tick labels and axis title labels. Default: true.
   * Set to false to hide all axis text (minimal margins applied automatically).
   */
  axes?: boolean;
}

const DEFAULT_MARGIN: ChartMargin = { top: 40, right: 20, bottom: 60, left: 80 };
const MINIMAL_MARGIN: ChartMargin = { top: 8, right: 8, bottom: 8, left: 8 };

/**
 * Base class for all chart types.
 * Manages engine lifecycle, margins, and coordinate systems.
 */
export abstract class BaseChart {
  protected engine: RenderEngine;
  protected interaction: InteractionHandler | null = null;
  protected text: TextRenderer;
  protected margin: ChartMargin;
  protected container: HTMLElement;
  protected showAxes: boolean;

  /** Toolbar (null if toolbar: false in options) */
  readonly toolbar: ChartToolbar | null;
  /** Annotation / selection overlay */
  readonly overlay: AnnotationOverlay;

  constructor(container: HTMLElement, options: BaseChartOptions = {}) {
    this.container = container;
    container.style.position = 'relative';

    this.showAxes = options.axes !== false;

    this.engine = new RenderEngine(container);

    // Annotation overlay (between WebGL canvas and text canvas)
    const isInteractive = options.interactive !== false;
    this.overlay = new AnnotationOverlay(container, this.engine, isInteractive);

    this.text = new TextRenderer(container);
    const defaultMargin = this.showAxes ? DEFAULT_MARGIN : MINIMAL_MARGIN;
    this.margin = { ...defaultMargin, ...options.margin };

    if (options.interactive !== false) {
      this.interaction = new InteractionHandler(this.engine);
    }

    // Toolbar
    const showToolbar = options.toolbar !== false;
    if (showToolbar) {
      this.toolbar = new ChartToolbar(
        container,
        {
          preset: options.toolbarPreset,
          defaultTool: options.defaultTool,
          tools: options.tools,
          actions: options.actions,
        },
        (tool) => this.overlay.setTool(tool),
        (action) => this.handleAction(action),
      );
      this.overlay.setTool(options.defaultTool ?? 'pan');
    } else {
      this.toolbar = null;
    }

    // Selection callback
    if (options.onSelect) {
      this.overlay.onSelect(options.onSelect);
    }
  }

  /** Plot area in pixels (excluding margins) */
  protected get plotArea(): { x: number; y: number; width: number; height: number } {
    const v = this.engine.viewport;
    return {
      x: this.margin.left,
      y: this.margin.top,
      width: v.width / v.pixelRatio - this.margin.left - this.margin.right,
      height: v.height / v.pixelRatio - this.margin.top - this.margin.bottom,
    };
  }

  /** Override to update chart when data changes */
  abstract update(data: unknown): void;

  /** Force a re-render */
  render(): void {
    this.engine.requestRender();
  }

  setCamera(camera: Partial<Camera>): void {
    if (camera.center) this.engine.camera.center = camera.center;
    if (camera.zoom !== undefined) this.engine.camera.zoom = camera.zoom;
    this.engine.requestRender();
  }

  resetCamera(): void {
    this.engine.camera = { center: { x: 0, y: 0 }, zoom: 1 };
    this.engine.requestRender();
  }

  resize(): void {
    this.engine.requestRender();
  }

  /** Clear all annotations drawn on the overlay */
  clearAnnotations(): void {
    this.overlay.clearAnnotations();
  }

  /** Register a callback for box/lasso selection events */
  onSelect(cb: (event: SelectionEvent) => void): () => void {
    return this.overlay.onSelect(cb);
  }

  /** Handle toolbar action button clicks */
  private handleAction(action: ActionType): void {
    if (action === 'save-png') this.exportPNG();
    else if (action === 'save-svg') this.exportSVG();
  }

  /** Export chart as PNG and trigger download */
  async exportPNG(filename = 'chart', options?: Partial<ExportOptions>): Promise<void> {
    const blob = await exportToPNG(this.engine, this.text, { format: 'png', filename, ...options });
    downloadBlob(blob, `${filename}.png`);
  }

  /** Export chart as SVG and trigger download */
  exportSVG(filename = 'chart', options?: Partial<ExportOptions>): void {
    const svg = exportToSVG(this.engine, this.text, { format: 'svg', filename, ...options });
    downloadSVG(svg, `${filename}.svg`);
  }

  destroy(): void {
    this.interaction?.destroy();
    this.overlay.destroy();
    this.toolbar?.destroy();
    this.text.destroy();
    this.engine.destroy();
  }
}
