import type { ShaderSource, UniformValue } from '../types.js';

export class ShaderProgram {
  readonly program: WebGLProgram;
  private uniformLocations = new Map<string, WebGLUniformLocation>();
  private attributeLocations = new Map<string, number>();

  constructor(
    private gl: WebGL2RenderingContext,
    source: ShaderSource,
  ) {
    const vert = this.compile(gl.VERTEX_SHADER, source.vertex);
    const frag = this.compile(gl.FRAGMENT_SHADER, source.fragment);

    this.program = gl.createProgram()!;
    gl.attachShader(this.program, vert);
    gl.attachShader(this.program, frag);
    gl.linkProgram(this.program);

    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(this.program);
      gl.deleteProgram(this.program);
      throw new Error(`Shader link error: ${log}`);
    }

    // Clean up individual shaders after linking
    gl.deleteShader(vert);
    gl.deleteShader(frag);
  }

  private compile(type: number, source: string): WebGLShader {
    const gl = this.gl;
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      const typeStr = type === gl.VERTEX_SHADER ? 'vertex' : 'fragment';
      throw new Error(`${typeStr} shader compile error: ${log}`);
    }

    return shader;
  }

  use(): void {
    this.gl.useProgram(this.program);
  }

  getUniformLocation(name: string): WebGLUniformLocation | null {
    if (this.uniformLocations.has(name)) {
      return this.uniformLocations.get(name)!;
    }
    const loc = this.gl.getUniformLocation(this.program, name);
    if (loc !== null) {
      this.uniformLocations.set(name, loc);
    }
    return loc;
  }

  getAttributeLocation(name: string): number {
    if (this.attributeLocations.has(name)) {
      return this.attributeLocations.get(name)!;
    }
    const loc = this.gl.getAttribLocation(this.program, name);
    this.attributeLocations.set(name, loc);
    return loc;
  }

  setUniform(name: string, uniform: UniformValue): void {
    const gl = this.gl;
    const loc = this.getUniformLocation(name);
    if (loc === null) return;

    switch (uniform.type) {
      case 'float':
        gl.uniform1f(loc, uniform.value as number);
        break;
      case 'int':
      case 'sampler2D':
        gl.uniform1i(loc, uniform.value as number);
        break;
      case 'vec2': {
        const v = uniform.value as number[];
        gl.uniform2f(loc, v[0], v[1]);
        break;
      }
      case 'vec3': {
        const v = uniform.value as number[];
        gl.uniform3f(loc, v[0], v[1], v[2]);
        break;
      }
      case 'vec4': {
        const v = uniform.value as number[];
        gl.uniform4f(loc, v[0], v[1], v[2], v[3]);
        break;
      }
      case 'mat4':
        gl.uniformMatrix4fv(loc, false, uniform.value as Float32Array);
        break;
    }
  }

  destroy(): void {
    this.gl.deleteProgram(this.program);
    this.uniformLocations.clear();
    this.attributeLocations.clear();
  }
}
