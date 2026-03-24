import type { Viewport, Camera, RenderState, ShaderSource, BufferDescriptor } from '../types.js';
import { ShaderProgram } from './shader.js';
import { BufferManager } from './buffer-manager.js';
import { TextureManager } from './texture-manager.js';

export interface RenderLayer {
  /** Unique identifier for this layer */
  id: string;
  /** Draw order (lower = drawn first) */
  order: number;
  /** Called each frame to render */
  render(engine: RenderEngine, state: RenderState): void;
  /** Called when viewport resizes */
  resize?(width: number, height: number): void;
  /** Called on destroy */
  dispose?(): void;
}

export class RenderEngine {
  readonly gl: WebGL2RenderingContext;
  readonly buffers: BufferManager;
  readonly textures: TextureManager;

  private canvas: HTMLCanvasElement;
  private resizeObserver: ResizeObserver;
  private layers: RenderLayer[] = [];
  private shaders = new Map<string, ShaderProgram>();
  private animationFrameId: number = 0;
  private running = false;
  private frameCount = 0;
  private resizeCallbacks: Array<(w: number, h: number) => void> = [];

  viewport: Viewport = { x: 0, y: 0, width: 0, height: 0, pixelRatio: 1 };
  camera: Camera = { center: { x: 0, y: 0 }, zoom: 1 };

  constructor(container: HTMLElement) {
    this.canvas = document.createElement('canvas');
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.canvas.style.display = 'block';
    container.appendChild(this.canvas);

    const gl = this.canvas.getContext('webgl2', {
      alpha: true,
      antialias: true,
      premultipliedAlpha: false,
      preserveDrawingBuffer: false,
    });

    if (!gl) {
      throw new Error('WebGL2 is not supported in this browser');
    }

    this.gl = gl;
    this.buffers = new BufferManager(gl);
    this.textures = new TextureManager(gl);

    // Enable standard blending
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    // Observe canvas element resize (not container, which may include
    // toolbar/legend/overlay DOM and report a larger height)
    this.resizeObserver = new ResizeObserver(entries => {
      const entry = entries[0];
      if (entry) {
        this.handleResize(entry.contentRect.width, entry.contentRect.height);
      }
    });
    this.resizeObserver.observe(this.canvas);

    // Initial size based on canvas CSS dimensions
    this.handleResize(this.canvas.clientWidth, this.canvas.clientHeight);
  }

  private handleResize(width: number, height: number): void {
    const pixelRatio = window.devicePixelRatio || 1;
    const w = Math.round(width * pixelRatio);
    const h = Math.round(height * pixelRatio);

    this.canvas.width = w;
    this.canvas.height = h;
    this.viewport = { x: 0, y: 0, width: w, height: h, pixelRatio };

    this.gl.viewport(0, 0, w, h);

    for (const layer of this.layers) {
      layer.resize?.(w, h);
    }

    // Notify resize subscribers (e.g. BaseChart re-renders text/labels)
    for (const cb of this.resizeCallbacks) cb(w, h);

    // Re-render if not in animation loop
    if (!this.running) {
      this.renderFrame();
    }
  }

  // ─── Shader Management ───

  createShader(key: string, source: ShaderSource): ShaderProgram {
    if (this.shaders.has(key)) {
      this.shaders.get(key)!.destroy();
    }
    const program = new ShaderProgram(this.gl, source);
    this.shaders.set(key, program);
    return program;
  }

  getShader(key: string): ShaderProgram | undefined {
    return this.shaders.get(key);
  }

  // ─── Buffer Shortcuts ───

  setBuffer(key: string, descriptor: BufferDescriptor): void {
    this.buffers.set(key, descriptor);
  }

  // ─── Layer Management ───

  addLayer(layer: RenderLayer): void {
    this.layers.push(layer);
    this.layers.sort((a, b) => a.order - b.order);
  }

  removeLayer(id: string): void {
    const idx = this.layers.findIndex(l => l.id === id);
    if (idx !== -1) {
      this.layers[idx].dispose?.();
      this.layers.splice(idx, 1);
    }
  }

  getLayer<T extends RenderLayer>(id: string): T | undefined {
    return this.layers.find(l => l.id === id) as T | undefined;
  }

  // ─── Render Loop ───

  private renderFrame = (): void => {
    const gl = this.gl;
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    const state: RenderState = {
      viewport: this.viewport,
      camera: this.camera,
      time: performance.now() / 1000,
      frameCount: this.frameCount++,
    };

    for (const layer of this.layers) {
      layer.render(this, state);
    }
  };

  private loop = (): void => {
    if (!this.running) return;
    this.renderFrame();
    this.animationFrameId = requestAnimationFrame(this.loop);
  };

  /** Start continuous rendering loop */
  start(): void {
    if (this.running) return;
    this.running = true;
    this.loop();
  }

  /** Stop continuous rendering loop */
  stop(): void {
    this.running = false;
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = 0;
    }
  }

  /** Render a single frame (use when not running continuous loop) */
  requestRender(): void {
    if (this.running) return; // loop handles it
    requestAnimationFrame(this.renderFrame);
  }

  /** Register a callback for canvas resize events */
  onResize(cb: (w: number, h: number) => void): () => void {
    this.resizeCallbacks.push(cb);
    return () => {
      const i = this.resizeCallbacks.indexOf(cb);
      if (i !== -1) this.resizeCallbacks.splice(i, 1);
    };
  }

  // ─── Cleanup ───

  destroy(): void {
    this.stop();
    this.resizeObserver.disconnect();

    for (const layer of this.layers) {
      layer.dispose?.();
    }
    this.layers = [];

    for (const [, shader] of this.shaders) {
      shader.destroy();
    }
    this.shaders.clear();

    this.buffers.destroy();
    this.textures.destroy();

    this.canvas.remove();
  }
}
