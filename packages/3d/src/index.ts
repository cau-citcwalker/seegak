// Types
export type { VolumeData, VolumeOptions, MeshData, MeshOptions, Scatter3DData, Scatter3DOptions } from './types.js';

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

// 3D Scatter
export { Scatter3DLayer } from './scatter/scatter3d-layer.js';
export { Scatter3DView }  from './scatter/scatter3d-view.js';
export { Scatter3DToolbar } from './scatter/scatter3d-toolbar.js';
export type { Scatter3DToolbarOptions } from './scatter/scatter3d-toolbar.js';
