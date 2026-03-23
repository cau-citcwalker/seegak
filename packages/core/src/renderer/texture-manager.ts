export interface TextureOptions {
  width: number;
  height: number;
  format?: number;       // gl.RGBA
  internalFormat?: number; // gl.RGBA32F
  type?: number;         // gl.FLOAT
  minFilter?: number;
  magFilter?: number;
  wrap?: number;
  data?: ArrayBufferView | null;
}

interface ManagedTexture {
  texture: WebGLTexture;
  unit: number;
  width: number;
  height: number;
}

export class TextureManager {
  private textures = new Map<string, ManagedTexture>();
  private nextUnit = 0;

  constructor(private gl: WebGL2RenderingContext) {}

  create(key: string, options: TextureOptions): WebGLTexture {
    const gl = this.gl;

    // Clean up existing
    if (this.textures.has(key)) {
      this.delete(key);
    }

    const texture = gl.createTexture()!;
    const unit = this.nextUnit++;

    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, texture);

    const format = options.format ?? gl.RGBA;
    const internalFormat = options.internalFormat ?? gl.RGBA;
    const type = options.type ?? gl.UNSIGNED_BYTE;

    gl.texImage2D(
      gl.TEXTURE_2D, 0, internalFormat,
      options.width, options.height, 0,
      format, type, options.data ?? null,
    );

    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, options.minFilter ?? gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, options.magFilter ?? gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, options.wrap ?? gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, options.wrap ?? gl.CLAMP_TO_EDGE);

    this.textures.set(key, { texture, unit, width: options.width, height: options.height });
    return texture;
  }

  /** Create a 1D LUT texture from a Float32Array (256 x 1 RGBA) */
  createLUT(key: string, data: Float32Array): WebGLTexture {
    const gl = this.gl;
    return this.create(key, {
      width: 256,
      height: 1,
      internalFormat: gl.RGBA32F,
      format: gl.RGBA,
      type: gl.FLOAT,
      minFilter: gl.LINEAR,
      magFilter: gl.LINEAR,
      data,
    });
  }

  bind(key: string): number {
    const managed = this.textures.get(key);
    if (!managed) return -1;
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + managed.unit);
    gl.bindTexture(gl.TEXTURE_2D, managed.texture);
    return managed.unit;
  }

  get(key: string): ManagedTexture | undefined {
    return this.textures.get(key);
  }

  delete(key: string): void {
    const managed = this.textures.get(key);
    if (managed) {
      this.gl.deleteTexture(managed.texture);
      this.textures.delete(key);
    }
  }

  destroy(): void {
    for (const [, managed] of this.textures) {
      this.gl.deleteTexture(managed.texture);
    }
    this.textures.clear();
    this.nextUnit = 0;
  }
}
