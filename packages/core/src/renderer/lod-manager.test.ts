import { describe, it, expect } from 'vitest';
import { LODManager } from './lod-manager.js';

describe('LODManager', () => {
  it('returns the correct LOD level for different zoom levels', () => {
    const lod = new LODManager();

    const lowZoom = lod.getLevel(0.3);
    expect(lowZoom.maxPoints).toBe(5000);

    const midZoom = lod.getLevel(1.0);
    expect(midZoom.maxPoints).toBe(50000);

    const highZoom = lod.getLevel(10);
    expect(highZoom.maxPoints).toBe(Infinity);
  });

  it('computes visible bounds', () => {
    const lod = new LODManager();
    const viewport = { x: 0, y: 0, width: 800, height: 600, pixelRatio: 1 };
    const camera = { center: { x: 0, y: 0 }, zoom: 1 };

    const bounds = lod.getVisibleBounds(viewport, camera);
    expect(bounds.width).toBeGreaterThan(0);
    expect(bounds.height).toBeGreaterThan(0);
    // Center should be at camera center
    expect(bounds.x + bounds.width / 2).toBeCloseTo(0);
    expect(bounds.y + bounds.height / 2).toBeCloseTo(0);
  });

  it('higher zoom = smaller visible bounds', () => {
    const lod = new LODManager();
    const viewport = { x: 0, y: 0, width: 800, height: 600, pixelRatio: 1 };

    const bounds1 = lod.getVisibleBounds(viewport, { center: { x: 0, y: 0 }, zoom: 1 });
    const bounds2 = lod.getVisibleBounds(viewport, { center: { x: 0, y: 0 }, zoom: 2 });

    expect(bounds2.width).toBeLessThan(bounds1.width);
    expect(bounds2.height).toBeLessThan(bounds1.height);
  });

  it('selectPoints filters to visible area', () => {
    const lod = new LODManager();
    const viewport = { x: 0, y: 0, width: 800, height: 600, pixelRatio: 1 };
    const camera = { center: { x: 0, y: 0 }, zoom: 1 };

    // Create points: some visible, some not
    const x = new Float32Array([0, 0.5, -0.5, 100, -100]);
    const y = new Float32Array([0, 0.5, -0.5, 100, -100]);

    const selected = lod.selectPoints(x, y, viewport, camera);

    // Points at (100,100) and (-100,-100) should be filtered out
    expect(selected.length).toBeLessThanOrEqual(5);
    expect(selected.length).toBeGreaterThanOrEqual(3); // at least the 3 near-center points
  });

  it('supports custom LOD levels', () => {
    const lod = new LODManager([
      { minZoom: 0, maxPoints: 100, pointSizeScale: 2 },
      { minZoom: 5, maxPoints: 1000, pointSizeScale: 1 },
    ]);

    expect(lod.getLevel(1).maxPoints).toBe(100);
    expect(lod.getLevel(10).maxPoints).toBe(1000);
  });
});
