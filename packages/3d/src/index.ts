// Types
export type { VolumeData, VolumeOptions, MeshData, MeshOptions } from './types.js';

// Math utilities
export type { Mat4 } from './math/mat4.js';
export {
  mat4Identity,
  mat4Multiply,
  mat4Perspective,
  mat4LookAt,
  mat4RotateX,
  mat4RotateY,
  mat4RotateZ,
  mat4Translate,
  mat4Scale,
  mat4Invert,
  mat4Transpose,
} from './math/mat4.js';
export { ArcballCamera } from './math/arcball.js';

// Volume rendering
export { VolumeLayer } from './volume/volume-layer.js';
export { VolumeView }  from './volume/volume-view.js';

// Mesh rendering
export { MeshLayer } from './mesh/mesh-layer.js';
export { MeshView }  from './mesh/mesh-view.js';
