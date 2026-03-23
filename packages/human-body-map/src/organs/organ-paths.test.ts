import { describe, it, expect } from 'vitest';
import { ANTERIOR_ORGANS, BODY_OUTLINE } from './organ-paths.js';

describe('organ paths', () => {
  it('has at least 15 organs defined', () => {
    expect(ANTERIOR_ORGANS.length).toBeGreaterThanOrEqual(15);
  });

  it('all organs have required fields', () => {
    for (const organ of ANTERIOR_ORGANS) {
      expect(organ.id).toBeTruthy();
      expect(organ.name).toBeTruthy();
      expect(organ.path).toBeTruthy();
      expect(typeof organ.labelX).toBe('number');
      expect(typeof organ.labelY).toBe('number');
      expect(organ.category).toBeTruthy();
    }
  });

  it('all organ IDs are unique', () => {
    const ids = ANTERIOR_ORGANS.map(o => o.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it('all organs have Korean names', () => {
    for (const organ of ANTERIOR_ORGANS) {
      expect(organ.nameKo).toBeTruthy();
    }
  });

  it('all paths start with M (valid SVG path)', () => {
    for (const organ of ANTERIOR_ORGANS) {
      expect(organ.path.trimStart().startsWith('M')).toBe(true);
    }
  });

  it('label positions are within viewBox (0-300 x, 0-600 y)', () => {
    for (const organ of ANTERIOR_ORGANS) {
      expect(organ.labelX).toBeGreaterThanOrEqual(0);
      expect(organ.labelX).toBeLessThanOrEqual(300);
      expect(organ.labelY).toBeGreaterThanOrEqual(0);
      expect(organ.labelY).toBeLessThanOrEqual(600);
    }
  });

  it('BODY_OUTLINE is defined and is a valid path', () => {
    expect(BODY_OUTLINE).toBeTruthy();
    expect(BODY_OUTLINE.trimStart().startsWith('M')).toBe(true);
  });

  it('includes key organs for biology visualization', () => {
    const ids = ANTERIOR_ORGANS.map(o => o.id);
    const required = [
      'brain', 'heart', 'lung_left', 'lung_right',
      'liver', 'stomach', 'kidney_left', 'kidney_right',
      'small_intestine', 'large_intestine', 'pancreas',
      'spleen', 'bladder', 'thyroid',
    ];
    for (const id of required) {
      expect(ids).toContain(id);
    }
  });

  it('all categories are valid', () => {
    const validCategories = [
      'nervous', 'respiratory', 'cardiovascular', 'digestive',
      'urinary', 'reproductive', 'musculoskeletal', 'endocrine',
      'lymphatic', 'integumentary',
    ];
    for (const organ of ANTERIOR_ORGANS) {
      expect(validCategories).toContain(organ.category);
    }
  });
});
