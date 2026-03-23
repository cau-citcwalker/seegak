import { describe, it, expect } from 'vitest';
import { sampleColorScale, colorScaleToTexture, VIRIDIS, PLASMA, INFERNO } from './color-scales.js';

describe('sampleColorScale', () => {
  it('returns first stop color at t=0', () => {
    const c = sampleColorScale(VIRIDIS, 0);
    expect(c.r).toBeCloseTo(0.267, 2);
  });

  it('returns last stop color at t=1', () => {
    const c = sampleColorScale(VIRIDIS, 1);
    expect(c.r).toBeCloseTo(0.993, 2);
  });

  it('interpolates at t=0.5', () => {
    const c = sampleColorScale(VIRIDIS, 0.5);
    // Should be the middle stop value
    expect(c.r).toBeCloseTo(0.127, 2);
    expect(c.g).toBeCloseTo(0.566, 2);
  });

  it('clamps below 0', () => {
    const c = sampleColorScale(VIRIDIS, -0.5);
    expect(c).toEqual(sampleColorScale(VIRIDIS, 0));
  });

  it('clamps above 1', () => {
    const c = sampleColorScale(VIRIDIS, 1.5);
    expect(c).toEqual(sampleColorScale(VIRIDIS, 1));
  });

  it('handles single-stop scale', () => {
    const scale = { stops: [{ position: 0.5, color: { r: 1, g: 0, b: 0, a: 1 } }] };
    const c = sampleColorScale(scale, 0.3);
    expect(c.r).toBe(1);
  });

  it('handles empty scale', () => {
    const c = sampleColorScale({ stops: [] }, 0.5);
    expect(c.r).toBe(0);
  });
});

describe('colorScaleToTexture', () => {
  it('produces a 256x4 Float32Array', () => {
    const data = colorScaleToTexture(VIRIDIS);
    expect(data).toBeInstanceOf(Float32Array);
    expect(data.length).toBe(256 * 4);
  });

  it('first pixel matches first stop', () => {
    const data = colorScaleToTexture(VIRIDIS);
    expect(data[0]).toBeCloseTo(0.267, 2); // r
    expect(data[3]).toBe(1); // a
  });

  it('last pixel matches last stop', () => {
    const data = colorScaleToTexture(VIRIDIS);
    const last = 255 * 4;
    expect(data[last]).toBeCloseTo(0.993, 2); // r
  });

  it('all values are in [0, 1]', () => {
    const data = colorScaleToTexture(PLASMA);
    for (let i = 0; i < data.length; i++) {
      expect(data[i]).toBeGreaterThanOrEqual(0);
      expect(data[i]).toBeLessThanOrEqual(1);
    }
  });
});

describe('built-in scales', () => {
  it('VIRIDIS has 5 stops', () => {
    expect(VIRIDIS.stops.length).toBe(5);
  });

  it('PLASMA has 5 stops', () => {
    expect(PLASMA.stops.length).toBe(5);
  });

  it('INFERNO has 5 stops', () => {
    expect(INFERNO.stops.length).toBe(5);
  });

  it('all stops are in [0, 1] position range', () => {
    for (const scale of [VIRIDIS, PLASMA, INFERNO]) {
      for (const stop of scale.stops) {
        expect(stop.position).toBeGreaterThanOrEqual(0);
        expect(stop.position).toBeLessThanOrEqual(1);
      }
    }
  });
});
