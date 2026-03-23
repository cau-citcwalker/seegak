import type { ColorScale, Vec4 } from '../types.js';
import { lerp } from './math.js';

/** Interpolate a color from a color scale at position t ∈ [0, 1] */
export function sampleColorScale(scale: ColorScale, t: number): Vec4 {
  const clamped = Math.max(0, Math.min(1, t));
  const stops = scale.stops;

  if (stops.length === 0) return { r: 0, g: 0, b: 0, a: 1 };
  if (stops.length === 1 || clamped <= stops[0].position) return stops[0].color;
  if (clamped >= stops[stops.length - 1].position) return stops[stops.length - 1].color;

  for (let i = 0; i < stops.length - 1; i++) {
    if (clamped >= stops[i].position && clamped <= stops[i + 1].position) {
      const localT = (clamped - stops[i].position) / (stops[i + 1].position - stops[i].position);
      const a = stops[i].color;
      const b = stops[i + 1].color;
      return {
        r: lerp(a.r, b.r, localT),
        g: lerp(a.g, b.g, localT),
        b: lerp(a.b, b.b, localT),
        a: lerp(a.a, b.a, localT),
      };
    }
  }

  return stops[stops.length - 1].color;
}

/** Generate a Float32Array LUT texture (256 x 1 RGBA) for GPU use */
export function colorScaleToTexture(scale: ColorScale): Float32Array {
  const data = new Float32Array(256 * 4);
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    const c = sampleColorScale(scale, t);
    data[i * 4 + 0] = c.r;
    data[i * 4 + 1] = c.g;
    data[i * 4 + 2] = c.b;
    data[i * 4 + 3] = c.a;
  }
  return data;
}

// ─── Built-in Scales ───

export const VIRIDIS: ColorScale = {
  stops: [
    { position: 0.0, color: { r: 0.267, g: 0.004, b: 0.329, a: 1 } },
    { position: 0.25, color: { r: 0.282, g: 0.141, b: 0.458, a: 1 } },
    { position: 0.5, color: { r: 0.127, g: 0.566, b: 0.551, a: 1 } },
    { position: 0.75, color: { r: 0.544, g: 0.773, b: 0.247, a: 1 } },
    { position: 1.0, color: { r: 0.993, g: 0.906, b: 0.144, a: 1 } },
  ],
};

export const PLASMA: ColorScale = {
  stops: [
    { position: 0.0, color: { r: 0.050, g: 0.030, b: 0.528, a: 1 } },
    { position: 0.25, color: { r: 0.494, g: 0.012, b: 0.658, a: 1 } },
    { position: 0.5, color: { r: 0.798, g: 0.280, b: 0.470, a: 1 } },
    { position: 0.75, color: { r: 0.973, g: 0.585, b: 0.253, a: 1 } },
    { position: 1.0, color: { r: 0.940, g: 0.975, b: 0.131, a: 1 } },
  ],
};

export const INFERNO: ColorScale = {
  stops: [
    { position: 0.0, color: { r: 0.001, g: 0.000, b: 0.014, a: 1 } },
    { position: 0.25, color: { r: 0.341, g: 0.062, b: 0.429, a: 1 } },
    { position: 0.5, color: { r: 0.735, g: 0.216, b: 0.330, a: 1 } },
    { position: 0.75, color: { r: 0.973, g: 0.553, b: 0.120, a: 1 } },
    { position: 1.0, color: { r: 0.988, g: 0.998, b: 0.645, a: 1 } },
  ],
};
