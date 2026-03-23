import type { Vec2, Vec4, Rect, Camera, Viewport } from '../types.js';

// ─── Vector Math ───

export function vec2(x: number, y: number): Vec2 {
  return { x, y };
}

export function vec4(r: number, g: number, b: number, a: number = 1): Vec4 {
  return { r, g, b, a };
}

export function addVec2(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function subVec2(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function scaleVec2(v: Vec2, s: number): Vec2 {
  return { x: v.x * s, y: v.y * s };
}

export function lenVec2(v: Vec2): number {
  return Math.sqrt(v.x * v.x + v.y * v.y);
}

export function distVec2(a: Vec2, b: Vec2): number {
  return lenVec2(subVec2(a, b));
}

// ─── Rect ───

export function rect(x: number, y: number, width: number, height: number): Rect {
  return { x, y, width, height };
}

export function containsPoint(r: Rect, p: Vec2): boolean {
  return p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height;
}

export function intersects(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x &&
         a.y < b.y + b.height && a.y + a.height > b.y;
}

// ─── Coordinate Transform ───

/** Screen pixel → world coordinate */
export function screenToWorld(screen: Vec2, viewport: Viewport, camera: Camera): Vec2 {
  const ndcX = (screen.x / viewport.width) * 2 - 1;
  const ndcY = 1 - (screen.y / viewport.height) * 2;
  return {
    x: ndcX / camera.zoom + camera.center.x,
    y: ndcY / camera.zoom + camera.center.y,
  };
}

/** World coordinate → screen pixel */
export function worldToScreen(world: Vec2, viewport: Viewport, camera: Camera): Vec2 {
  const ndcX = (world.x - camera.center.x) * camera.zoom;
  const ndcY = (world.y - camera.center.y) * camera.zoom;
  return {
    x: (ndcX + 1) * 0.5 * viewport.width,
    y: (1 - ndcY) * 0.5 * viewport.height,
  };
}

// ─── Matrix (4x4 column-major for WebGL) ───

export function ortho(
  left: number, right: number,
  bottom: number, top: number,
  near: number, far: number,
): Float32Array {
  const m = new Float32Array(16);
  m[0] = 2 / (right - left);
  m[5] = 2 / (top - bottom);
  m[10] = -2 / (far - near);
  m[12] = -(right + left) / (right - left);
  m[13] = -(top + bottom) / (top - bottom);
  m[14] = -(far + near) / (far - near);
  m[15] = 1;
  return m;
}

export function cameraMatrix(viewport: Viewport, camera: Camera): Float32Array {
  const aspect = viewport.width / viewport.height;
  const halfW = aspect / camera.zoom;
  const halfH = 1 / camera.zoom;
  return ortho(
    camera.center.x - halfW, camera.center.x + halfW,
    camera.center.y - halfH, camera.center.y + halfH,
    -1, 1,
  );
}

// ─── Color Utilities ───

const _hexVec4Cache = new Map<string, Vec4>();
export function hexToVec4(hex: string): Vec4 {
  const cached = _hexVec4Cache.get(hex);
  if (cached) return cached;
  const h = hex.replace('#', '');
  const v: Vec4 = {
    r: parseInt(h.substring(0, 2), 16) / 255,
    g: parseInt(h.substring(2, 4), 16) / 255,
    b: parseInt(h.substring(4, 6), 16) / 255,
    a: h.length === 8 ? parseInt(h.substring(6, 8), 16) / 255 : 1,
  };
  _hexVec4Cache.set(hex, v);
  return v;
}

export function vec4ToHex(c: Vec4): string {
  const r = Math.round(c.r * 255).toString(16).padStart(2, '0');
  const g = Math.round(c.g * 255).toString(16).padStart(2, '0');
  const b = Math.round(c.b * 255).toString(16).padStart(2, '0');
  return `#${r}${g}${b}`;
}

// ─── Numeric Utilities ───

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function remap(
  value: number,
  inMin: number, inMax: number,
  outMin: number, outMax: number,
): number {
  const t = (value - inMin) / (inMax - inMin);
  return lerp(outMin, outMax, t);
}
