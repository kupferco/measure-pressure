import { describe, expect, it } from 'vitest';
import {
  incompleteBeta,
  linearRegression,
  mean,
  standardDeviation,
  variance,
  welchTTest,
} from './stats.js';

describe('descriptive statistics', () => {
  it('computes mean and sample variance', () => {
    expect(mean([2, 4, 6])).toBe(4);
    expect(variance([2, 4, 6])).toBe(4);
    expect(standardDeviation([2, 4, 6])).toBe(2);
  });

  it('treats degenerate input as zero rather than NaN', () => {
    expect(mean([])).toBe(0);
    expect(variance([5])).toBe(0);
  });
});

describe('incompleteBeta', () => {
  it('is bounded and monotonic', () => {
    expect(incompleteBeta(2, 3, 0)).toBe(0);
    expect(incompleteBeta(2, 3, 1)).toBe(1);
    expect(incompleteBeta(2, 3, 0.3)).toBeLessThan(incompleteBeta(2, 3, 0.7));
  });

  it('matches the known value I_0.5(2,2) = 0.5', () => {
    expect(incompleteBeta(2, 2, 0.5)).toBeCloseTo(0.5, 6);
  });
});

describe('welchTTest', () => {
  // Reference values computed independently of this implementation. A borderline
  // case on purpose: p just above 0.05 is exactly where a bug would hide.
  it('reproduces an independently computed result', () => {
    const a = [27.5, 21.0, 19.0, 23.6, 17.0, 17.9, 16.9, 20.1, 21.9, 22.6];
    const b = [27.1, 22.0, 20.8, 23.4, 23.4, 23.5, 25.8, 22.0, 24.8, 20.2];
    const result = welchTTest(a, b);
    expect(result).not.toBeNull();
    expect(result!.t).toBeCloseTo(-2.035662, 5);
    expect(result!.degreesOfFreedom).toBeCloseTo(15.497899, 5);
    expect(result!.pValue).toBeCloseTo(0.059254, 5);
  });

  it('finds a clearly separated pair significant', () => {
    const low = [110, 112, 114, 111, 113, 109, 112];
    const high = [140, 142, 138, 141, 143, 139, 140];
    const result = welchTTest(high, low);
    expect(result!.pValue).toBeLessThan(0.001);
    expect(result!.t).toBeGreaterThan(0);
  });

  it('finds two samples from the same population unremarkable', () => {
    const a = [120, 118, 122, 119, 121, 117, 123];
    const b = [121, 119, 120, 122, 118, 120, 121];
    expect(welchTTest(a, b)!.pValue).toBeGreaterThan(0.3);
  });

  it('refuses to test groups too small to say anything', () => {
    expect(welchTTest([120], [130, 140])).toBeNull();
    expect(welchTTest([], [])).toBeNull();
  });

  it('returns null rather than dividing by zero on constant input', () => {
    expect(welchTTest([120, 120, 120], [130, 130, 130])).toBeNull();
  });

  it('is symmetric in its p-value', () => {
    const a = [130, 135, 128, 140, 132];
    const b = [120, 118, 125, 119, 122];
    expect(welchTTest(a, b)!.pValue).toBeCloseTo(welchTTest(b, a)!.pValue, 10);
  });
});

describe('linearRegression', () => {
  it('recovers a known line', () => {
    const points = [0, 1, 2, 3, 4].map((x) => ({ x, y: 3 * x + 7 }));
    const trend = linearRegression(points)!;
    expect(trend.slope).toBeCloseTo(3, 10);
    expect(trend.intercept).toBeCloseTo(7, 10);
  });

  it('reports a downward trend as a negative slope', () => {
    const points = [
      { x: 0, y: 140 },
      { x: 10, y: 135 },
      { x: 20, y: 128 },
      { x: 30, y: 125 },
    ];
    expect(linearRegression(points)!.slope).toBeLessThan(0);
  });

  it('returns null when there is nothing to fit', () => {
    expect(linearRegression([{ x: 1, y: 2 }])).toBeNull();
    expect(linearRegression([{ x: 5, y: 1 }, { x: 5, y: 9 }])).toBeNull();
  });
});
