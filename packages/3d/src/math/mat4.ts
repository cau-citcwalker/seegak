/** 4x4 matrix stored in column-major order as a Float32Array (16 elements). */
export type Mat4 = Float32Array;

/** Return a new identity matrix. */
export function mat4Identity(): Mat4 {
  const m = new Float32Array(16);
  m[0] = 1; m[5] = 1; m[10] = 1; m[15] = 1;
  return m;
}

/** Multiply two column-major 4x4 matrices: result = a * b. */
export function mat4Multiply(a: Mat4, b: Mat4): Mat4 {
  const out = new Float32Array(16);
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) {
        sum += a[k * 4 + row] * b[col * 4 + k];
      }
      out[col * 4 + row] = sum;
    }
  }
  return out;
}

/**
 * Perspective projection matrix (column-major, depth maps to [-1, 1]).
 * @param fov  vertical field of view in radians
 * @param aspect  width / height
 * @param near  near clip plane (> 0)
 * @param far  far clip plane
 */
export function mat4Perspective(
  fov: number,
  aspect: number,
  near: number,
  far: number,
): Mat4 {
  const f = 1.0 / Math.tan(fov / 2);
  const nf = 1 / (near - far);
  const m = new Float32Array(16);
  m[0]  = f / aspect;
  m[5]  = f;
  m[10] = (far + near) * nf;
  m[11] = -1;
  m[14] = 2 * far * near * nf;
  return m;
}

/**
 * View matrix that positions a camera looking from `eye` toward `center`
 * with the given `up` direction.
 */
export function mat4LookAt(
  eye: [number, number, number],
  center: [number, number, number],
  up: [number, number, number],
): Mat4 {
  const fx = center[0] - eye[0];
  const fy = center[1] - eye[1];
  const fz = center[2] - eye[2];

  const fLen = Math.sqrt(fx * fx + fy * fy + fz * fz);
  const f0 = fx / fLen;
  const f1 = fy / fLen;
  const f2 = fz / fLen;

  // s = f × up
  const s0 = f1 * up[2] - f2 * up[1];
  const s1 = f2 * up[0] - f0 * up[2];
  const s2 = f0 * up[1] - f1 * up[0];
  const sLen = Math.sqrt(s0 * s0 + s1 * s1 + s2 * s2);
  const sn0 = s0 / sLen;
  const sn1 = s1 / sLen;
  const sn2 = s2 / sLen;

  // u = s × f
  const u0 = sn1 * f2 - sn2 * f1;
  const u1 = sn2 * f0 - sn0 * f2;
  const u2 = sn0 * f1 - sn1 * f0;

  const m = new Float32Array(16);
  m[0]  = sn0; m[1]  = u0; m[2]  = -f0; m[3]  = 0;
  m[4]  = sn1; m[5]  = u1; m[6]  = -f1; m[7]  = 0;
  m[8]  = sn2; m[9]  = u2; m[10] = -f2; m[11] = 0;
  m[12] = -(sn0 * eye[0] + sn1 * eye[1] + sn2 * eye[2]);
  m[13] = -(u0  * eye[0] + u1  * eye[1] + u2  * eye[2]);
  m[14] =   f0  * eye[0] + f1  * eye[1] + f2  * eye[2];
  m[15] = 1;
  return m;
}

/** Rotate matrix `m` by `angle` radians around the X axis. */
export function mat4RotateX(m: Mat4, angle: number): Mat4 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const rot = mat4Identity();
  rot[5] = c;  rot[6] = s;
  rot[9] = -s; rot[10] = c;
  return mat4Multiply(m, rot);
}

/** Rotate matrix `m` by `angle` radians around the Y axis. */
export function mat4RotateY(m: Mat4, angle: number): Mat4 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const rot = mat4Identity();
  rot[0] = c;  rot[2] = -s;
  rot[8] = s;  rot[10] = c;
  return mat4Multiply(m, rot);
}

/** Rotate matrix `m` by `angle` radians around the Z axis. */
export function mat4RotateZ(m: Mat4, angle: number): Mat4 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const rot = mat4Identity();
  rot[0] = c;  rot[1] = s;
  rot[4] = -s; rot[5] = c;
  return mat4Multiply(m, rot);
}

/** Translate matrix `m` by (tx, ty, tz). */
export function mat4Translate(m: Mat4, tx: number, ty: number, tz: number): Mat4 {
  const t = mat4Identity();
  t[12] = tx; t[13] = ty; t[14] = tz;
  return mat4Multiply(m, t);
}

/** Scale matrix `m` by (sx, sy, sz). */
export function mat4Scale(m: Mat4, sx: number, sy: number, sz: number): Mat4 {
  const s = mat4Identity();
  s[0] = sx; s[5] = sy; s[10] = sz;
  return mat4Multiply(m, s);
}

/**
 * Invert a 4x4 column-major matrix.
 * Returns null if the matrix is singular.
 */
export function mat4Invert(m: Mat4): Mat4 | null {
  const a00 = m[0],  a01 = m[1],  a02 = m[2],  a03 = m[3];
  const a10 = m[4],  a11 = m[5],  a12 = m[6],  a13 = m[7];
  const a20 = m[8],  a21 = m[9],  a22 = m[10], a23 = m[11];
  const a30 = m[12], a31 = m[13], a32 = m[14], a33 = m[15];

  const b00 = a00 * a11 - a01 * a10;
  const b01 = a00 * a12 - a02 * a10;
  const b02 = a00 * a13 - a03 * a10;
  const b03 = a01 * a12 - a02 * a11;
  const b04 = a01 * a13 - a03 * a11;
  const b05 = a02 * a13 - a03 * a12;
  const b06 = a20 * a31 - a21 * a30;
  const b07 = a20 * a32 - a22 * a30;
  const b08 = a20 * a33 - a23 * a30;
  const b09 = a21 * a32 - a22 * a31;
  const b10 = a21 * a33 - a23 * a31;
  const b11 = a22 * a33 - a23 * a32;

  const det =
    b00 * b11 - b01 * b10 + b02 * b09 +
    b03 * b08 - b04 * b07 + b05 * b06;

  if (Math.abs(det) < 1e-15) return null;

  const invDet = 1 / det;
  const out = new Float32Array(16);
  out[0]  = ( a11 * b11 - a12 * b10 + a13 * b09) * invDet;
  out[1]  = (-a01 * b11 + a02 * b10 - a03 * b09) * invDet;
  out[2]  = ( a31 * b05 - a32 * b04 + a33 * b03) * invDet;
  out[3]  = (-a21 * b05 + a22 * b04 - a23 * b03) * invDet;
  out[4]  = (-a10 * b11 + a12 * b08 - a13 * b07) * invDet;
  out[5]  = ( a00 * b11 - a02 * b08 + a03 * b07) * invDet;
  out[6]  = (-a30 * b05 + a32 * b02 - a33 * b01) * invDet;
  out[7]  = ( a20 * b05 - a22 * b02 + a23 * b01) * invDet;
  out[8]  = ( a10 * b10 - a11 * b08 + a13 * b06) * invDet;
  out[9]  = (-a00 * b10 + a01 * b08 - a03 * b06) * invDet;
  out[10] = ( a30 * b04 - a31 * b02 + a33 * b00) * invDet;
  out[11] = (-a20 * b04 + a21 * b02 - a23 * b00) * invDet;
  out[12] = (-a10 * b09 + a11 * b07 - a12 * b06) * invDet;
  out[13] = ( a00 * b09 - a01 * b07 + a02 * b06) * invDet;
  out[14] = (-a30 * b03 + a31 * b01 - a32 * b00) * invDet;
  out[15] = ( a20 * b03 - a21 * b01 + a22 * b00) * invDet;
  return out;
}

/** Transpose a 4x4 column-major matrix. */
export function mat4Transpose(m: Mat4): Mat4 {
  const out = new Float32Array(16);
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      out[row * 4 + col] = m[col * 4 + row];
    }
  }
  return out;
}
