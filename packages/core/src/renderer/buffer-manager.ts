import type { BufferDescriptor } from '../types.js';

interface ManagedBuffer {
  buffer: WebGLBuffer;
  usage: number;
  byteLength: number;
}

const USAGE_MAP = {
  static: WebGL2RenderingContext.STATIC_DRAW,
  dynamic: WebGL2RenderingContext.DYNAMIC_DRAW,
  stream: WebGL2RenderingContext.STREAM_DRAW,
} as const;

export class BufferManager {
  private buffers = new Map<string, ManagedBuffer>();

  constructor(private gl: WebGL2RenderingContext) {}

  /**
   * Create or update a named buffer.
   * If the buffer already exists with the same size, uses bufferSubData (faster).
   */
  set(key: string, descriptor: BufferDescriptor): void {
    const gl = this.gl;
    const usage = USAGE_MAP[descriptor.usage];
    const existing = this.buffers.get(key);

    if (existing && existing.byteLength === descriptor.data.byteLength && existing.usage === usage) {
      // Reuse existing buffer — update data in place
      gl.bindBuffer(gl.ARRAY_BUFFER, existing.buffer);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, descriptor.data);
    } else {
      // Create new buffer (or replace with different size)
      if (existing) {
        gl.deleteBuffer(existing.buffer);
      }
      const buffer = gl.createBuffer()!;
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, descriptor.data, usage);
      this.buffers.set(key, { buffer, usage, byteLength: descriptor.data.byteLength });
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, null);
  }

  get(key: string): WebGLBuffer | null {
    return this.buffers.get(key)?.buffer ?? null;
  }

  has(key: string): boolean {
    return this.buffers.has(key);
  }

  delete(key: string): void {
    const existing = this.buffers.get(key);
    if (existing) {
      this.gl.deleteBuffer(existing.buffer);
      this.buffers.delete(key);
    }
  }

  destroy(): void {
    for (const [, managed] of this.buffers) {
      this.gl.deleteBuffer(managed.buffer);
    }
    this.buffers.clear();
  }
}
