import { describe, it, expect, vi } from 'vitest';
import { Easing } from './animator.js';

describe('Easing functions', () => {
  const easings = Object.entries(Easing);

  for (const [name, fn] of easings) {
    describe(name, () => {
      it('returns 0 at t=0', () => {
        expect(fn(0)).toBeCloseTo(0, 5);
      });

      it('returns 1 at t=1', () => {
        expect(fn(1)).toBeCloseTo(1, 5);
      });

      it('returns values in reasonable range for t in [0, 1]', () => {
        for (let t = 0; t <= 1; t += 0.1) {
          const v = fn(t);
          // Allow slight overshoot for elastic easing
          expect(v).toBeGreaterThanOrEqual(-0.5);
          expect(v).toBeLessThanOrEqual(1.5);
        }
      });
    });
  }

  it('linear is identity', () => {
    expect(Easing.linear(0.5)).toBe(0.5);
    expect(Easing.linear(0.25)).toBe(0.25);
  });

  it('easeInQuad starts slow', () => {
    expect(Easing.easeInQuad(0.25)).toBeLessThan(0.25);
  });

  it('easeOutQuad starts fast', () => {
    expect(Easing.easeOutQuad(0.25)).toBeGreaterThan(0.25);
  });
});
