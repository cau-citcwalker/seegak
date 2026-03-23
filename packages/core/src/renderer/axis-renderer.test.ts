import { describe, it, expect } from 'vitest';
import { generateTicks } from './axis-renderer.js';

describe('generateTicks', () => {
  it('generates ticks for 0-100 range', () => {
    const ticks = generateTicks(0, 100, 6);
    expect(ticks.length).toBeGreaterThan(0);
    expect(ticks[0]).toBeGreaterThanOrEqual(0);
    expect(ticks[ticks.length - 1]).toBeLessThanOrEqual(100);
  });

  it('generates nice round numbers', () => {
    const ticks = generateTicks(0, 100, 6);
    for (const t of ticks) {
      // All ticks should be multiples of some nice step
      expect(t % 10 === 0 || t % 20 === 0 || t % 25 === 0 || t % 50 === 0).toBe(true);
    }
  });

  it('handles negative ranges', () => {
    const ticks = generateTicks(-50, 50, 6);
    expect(ticks.some(t => t < 0)).toBe(true);
    expect(ticks.some(t => t > 0)).toBe(true);
  });

  it('handles small ranges', () => {
    const ticks = generateTicks(0, 1, 5);
    expect(ticks.length).toBeGreaterThan(0);
    expect(ticks[0]).toBeGreaterThanOrEqual(0);
    expect(ticks[ticks.length - 1]).toBeLessThanOrEqual(1);
  });

  it('handles equal min/max', () => {
    const ticks = generateTicks(5, 5, 5);
    expect(ticks).toEqual([5]);
  });

  it('handles very large ranges', () => {
    const ticks = generateTicks(0, 1000000, 6);
    expect(ticks.length).toBeGreaterThan(0);
    expect(ticks.every(t => t >= 0 && t <= 1000000)).toBe(true);
  });

  it('returns sorted ticks', () => {
    const ticks = generateTicks(-10, 10, 8);
    for (let i = 1; i < ticks.length; i++) {
      expect(ticks[i]).toBeGreaterThan(ticks[i - 1]);
    }
  });
});
