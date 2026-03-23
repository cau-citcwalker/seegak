// ─── Geometry ───

export interface Vec2 {
  x: number;
  y: number;
}

export interface Vec4 {
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

// ─── Rendering ───

export interface Viewport {
  x: number;
  y: number;
  width: number;
  height: number;
  pixelRatio: number;
}

export interface Camera {
  center: Vec2;
  zoom: number;
}

export interface RenderState {
  viewport: Viewport;
  camera: Camera;
  time: number;
  frameCount: number;
}

// ─── Buffers ───

export interface BufferDescriptor {
  data: Float32Array | Uint8Array | Uint16Array | Uint32Array;
  usage: 'static' | 'dynamic' | 'stream';
  /** Number of components per vertex attribute (1, 2, 3, or 4) */
  size: number;
}

export interface AttributeLayout {
  name: string;
  buffer: string;
  size: number;
  type: number; // GL enum
  normalized: boolean;
  stride: number;
  offset: number;
}

// ─── Shader ───

export interface ShaderSource {
  vertex: string;
  fragment: string;
}

export interface UniformValue {
  type: 'float' | 'vec2' | 'vec3' | 'vec4' | 'mat4' | 'int' | 'sampler2D';
  value: number | number[] | Float32Array | WebGLTexture;
}

// ─── Color ───

export interface ColorScale {
  stops: Array<{ position: number; color: Vec4 }>;
}

// ─── Interaction ───

export type InteractionEvent =
  | { type: 'click'; position: Vec2; screenPosition: Vec2 }
  | { type: 'hover'; position: Vec2; screenPosition: Vec2 }
  | { type: 'drag'; delta: Vec2; screenDelta: Vec2 }
  | { type: 'zoom'; center: Vec2; factor: number }
  | { type: 'pan'; delta: Vec2 };

export interface HitTestResult {
  index: number;
  distance: number;
  data?: unknown;
}
