import { describe, it, expect } from 'vitest';
import {
  vec2, vec4, addVec2, subVec2, scaleVec2, lenVec2, distVec2,
  rect, containsPoint, intersects,
  screenToWorld, worldToScreen,
  ortho, cameraMatrix,
  hexToVec4, vec4ToHex,
  clamp, lerp, remap,
} from './math.js';

describe('vec2', () => {
  it('creates a vector', () => {
    const v = vec2(3, 4);
    expect(v).toEqual({ x: 3, y: 4 });
  });

  it('adds vectors', () => {
    expect(addVec2(vec2(1, 2), vec2(3, 4))).toEqual({ x: 4, y: 6 });
  });

  it('subtracts vectors', () => {
    expect(subVec2(vec2(5, 7), vec2(2, 3))).toEqual({ x: 3, y: 4 });
  });

  it('scales vectors', () => {
    expect(scaleVec2(vec2(3, 4), 2)).toEqual({ x: 6, y: 8 });
  });

  it('computes length', () => {
    expect(lenVec2(vec2(3, 4))).toBe(5);
  });

  it('computes distance', () => {
    expect(distVec2(vec2(0, 0), vec2(3, 4))).toBe(5);
  });
});

describe('vec4', () => {
  it('creates with default alpha', () => {
    const v = vec4(1, 0, 0);
    expect(v).toEqual({ r: 1, g: 0, b: 0, a: 1 });
  });

  it('creates with custom alpha', () => {
    const v = vec4(1, 0, 0, 0.5);
    expect(v.a).toBe(0.5);
  });
});

describe('rect', () => {
  it('creates a rect', () => {
    const r = rect(10, 20, 100, 50);
    expect(r).toEqual({ x: 10, y: 20, width: 100, height: 50 });
  });

  it('containsPoint - inside', () => {
    expect(containsPoint(rect(0, 0, 10, 10), vec2(5, 5))).toBe(true);
  });

  it('containsPoint - outside', () => {
    expect(containsPoint(rect(0, 0, 10, 10), vec2(15, 5))).toBe(false);
  });

  it('containsPoint - on edge', () => {
    expect(containsPoint(rect(0, 0, 10, 10), vec2(10, 10))).toBe(true);
  });

  it('intersects - overlapping', () => {
    expect(intersects(rect(0, 0, 10, 10), rect(5, 5, 10, 10))).toBe(true);
  });

  it('intersects - not overlapping', () => {
    expect(intersects(rect(0, 0, 10, 10), rect(20, 20, 10, 10))).toBe(false);
  });
});

describe('color conversion', () => {
  it('hexToVec4 - 6 digit', () => {
    const c = hexToVec4('#ff0000');
    expect(c.r).toBe(1);
    expect(c.g).toBe(0);
    expect(c.b).toBe(0);
    expect(c.a).toBe(1);
  });

  it('hexToVec4 - without hash', () => {
    const c = hexToVec4('00ff00');
    expect(c.g).toBe(1);
  });

  it('hexToVec4 - 8 digit with alpha', () => {
    const c = hexToVec4('#ff000080');
    expect(c.a).toBeCloseTo(0.502, 2);
  });

  it('vec4ToHex', () => {
    expect(vec4ToHex({ r: 1, g: 0, b: 0, a: 1 })).toBe('#ff0000');
    expect(vec4ToHex({ r: 0, g: 1, b: 0, a: 1 })).toBe('#00ff00');
  });

  it('roundtrips', () => {
    const original = '#1f77b4';
    const vec = hexToVec4(original);
    const back = vec4ToHex(vec);
    expect(back).toBe(original);
  });
});

describe('numeric utilities', () => {
  it('clamp', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-5, 0, 10)).toBe(0);
    expect(clamp(15, 0, 10)).toBe(10);
  });

  it('lerp', () => {
    expect(lerp(0, 10, 0.5)).toBe(5);
    expect(lerp(0, 10, 0)).toBe(0);
    expect(lerp(0, 10, 1)).toBe(10);
  });

  it('remap', () => {
    expect(remap(5, 0, 10, 0, 100)).toBe(50);
    expect(remap(0, 0, 10, 100, 200)).toBe(100);
  });
});

describe('coordinate transforms', () => {
  const viewport = { x: 0, y: 0, width: 800, height: 600, pixelRatio: 1 };
  const camera = { center: { x: 0, y: 0 }, zoom: 1 };

  it('screenToWorld - center of screen maps to camera center', () => {
    const world = screenToWorld(vec2(400, 300), viewport, camera);
    expect(world.x).toBeCloseTo(0);
    expect(world.y).toBeCloseTo(0);
  });

  it('worldToScreen - camera center maps to center of screen', () => {
    const screen = worldToScreen(vec2(0, 0), viewport, camera);
    expect(screen.x).toBeCloseTo(400);
    expect(screen.y).toBeCloseTo(300);
  });

  it('roundtrips', () => {
    const original = vec2(0.5, -0.3);
    const screen = worldToScreen(original, viewport, camera);
    const back = screenToWorld(screen, viewport, camera);
    expect(back.x).toBeCloseTo(original.x);
    expect(back.y).toBeCloseTo(original.y);
  });
});

describe('ortho matrix', () => {
  it('produces a 16-element Float32Array', () => {
    const m = ortho(-1, 1, -1, 1, -1, 1);
    expect(m).toBeInstanceOf(Float32Array);
    expect(m.length).toBe(16);
  });

  it('identity-like for unit cube', () => {
    const m = ortho(-1, 1, -1, 1, -1, 1);
    expect(m[0]).toBeCloseTo(1);  // 2/(right-left)
    expect(m[5]).toBeCloseTo(1);  // 2/(top-bottom)
    expect(m[15]).toBe(1);
  });
});

describe('cameraMatrix', () => {
  it('produces a valid projection matrix', () => {
    const viewport = { x: 0, y: 0, width: 800, height: 600, pixelRatio: 1 };
    const camera = { center: { x: 0, y: 0 }, zoom: 1 };
    const m = cameraMatrix(viewport, camera);
    expect(m).toBeInstanceOf(Float32Array);
    expect(m.length).toBe(16);
    expect(m[15]).toBe(1);
  });
});
