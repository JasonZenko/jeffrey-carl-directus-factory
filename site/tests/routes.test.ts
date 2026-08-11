import { describe, expect, it } from 'vitest';
import { contract, pages } from './helpers';

describe('route inventory', () => {
  it('contains exactly 78 routes at preserved legacy .asp paths', () => {
    expect(pages).toHaveLength(78);
    const paths = pages.map((p) => p.legacy_path);
    expect(new Set(paths).size).toBe(78);
    for (const path of paths) {
      expect(path).toMatch(/^\/p\/.+-p\d+\.asp$/);
    }
  });

  it('matches the immutable auditor contract route set exactly', () => {
    expect(contract.routes).toBe(78);
    const contractRoutes = contract.contracts.map((c: any) => c.route).sort();
    const pageRoutes = pages.map((p) => p.legacy_path).sort();
    expect(pageRoutes).toEqual(contractRoutes);
  });

  it('covers all six page families with the frozen distribution', () => {
    const expected: Record<string, number> = {
      'about-team': 4,
      'service-detail': 47,
      conversion: 3,
      home: 1,
      'patient-resource': 3,
      location: 20,
    };
    const actual: Record<string, number> = {};
    for (const page of pages) actual[page.family] = (actual[page.family] ?? 0) + 1;
    expect(actual).toEqual(expected);
  });
});
