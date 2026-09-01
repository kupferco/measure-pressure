import { describe, expect, it } from 'vitest';
import { parseOmronDisplay, type OcrToken } from './omron-parser.js';

/** Builds a token; `size` stands in for glyph height so the tests can express type scale. */
function token(text: string, x: number, y: number, size = 40, confidence = 0.9): OcrToken {
  return {
    text,
    confidence,
    box: { x, y, width: text.length * size * 0.6, height: size },
  };
}

/** A well-lit, straight-on photo of a typical Omron display. */
function idealDisplay(sys = '128', dia = '82', pulse = '67'): OcrToken[] {
  return [
    token('SYS', 20, 40, 18),
    token('mmHg', 20, 62, 12),
    token(sys, 180, 30, 56),
    token('DIA', 20, 130, 18),
    token('mmHg', 20, 152, 12),
    token(dia, 180, 120, 56),
    token('PULSE', 20, 220, 18),
    token('/min', 20, 242, 12),
    token(pulse, 180, 210, 56),
  ];
}

describe('parseOmronDisplay', () => {
  it('reads a clean display using the printed labels', () => {
    const result = parseOmronDisplay(idealDisplay());
    expect(result).toMatchObject({ systolic: 128, diastolic: 82, pulse: 67 });
    expect(result.evidence.strategy).toBe('labels');
    expect(result.confidence).toBeGreaterThan(0.8);
  });

  it('never reports full confidence, because a human always confirms', () => {
    const result = parseOmronDisplay(idealDisplay());
    expect(result.confidence).toBeLessThan(1);
  });

  it('falls back to the largest column when no labels are legible', () => {
    const tokens = [token('128', 180, 30, 56), token('82', 180, 120, 56), token('67', 180, 210, 56)];
    const result = parseOmronDisplay(tokens);
    expect(result).toMatchObject({ systolic: 128, diastolic: 82, pulse: 67 });
    expect(result.evidence.strategy).toBe('column');
  });

  it('ignores the clock and memory index printed in smaller type', () => {
    const tokens = [
      ...idealDisplay(),
      token('07', 300, 12, 14), // clock hours
      token('45', 330, 12, 14), // clock minutes
      token('12', 20, 300, 14), // memory slot
    ];
    const result = parseOmronDisplay(tokens);
    expect(result).toMatchObject({ systolic: 128, diastolic: 82, pulse: 67 });
  });

  it('recovers digits that Vision returned as look-alike letters', () => {
    // 128 -> "l28", 82 -> "B2", 67 -> "G7"
    const result = parseOmronDisplay(idealDisplay('l28', 'B2', 'G7'));
    expect(result).toMatchObject({ systolic: 128, diastolic: 82, pulse: 67 });
    expect(result.evidence.correctedGlyphs).toBe(true);
    // Guessed glyphs must visibly cost confidence and raise a warning.
    expect(result.confidence).toBeLessThan(0.8);
    expect(result.warnings.some((w) => /ambiguous/i.test(w))).toBe(true);
  });

  it('does not mangle the labels themselves into numbers', () => {
    const result = parseOmronDisplay(idealDisplay());
    // "SYS" would become 545 under a naive letter-to-digit substitution.
    expect(result.systolic).not.toBe(545);
  });

  it('reorders a systolic/diastolic pair that came out backwards', () => {
    const tokens = [token('82', 180, 30, 56), token('128', 180, 120, 56)];
    const result = parseOmronDisplay(tokens);
    expect(result).toMatchObject({ systolic: 128, diastolic: 82 });
    expect(result.warnings.some((w) => /swapped/i.test(w))).toBe(true);
  });

  it('splits a combined 120/80 reading', () => {
    const result = parseOmronDisplay([token('128/82', 180, 30, 56)]);
    expect(result).toMatchObject({ systolic: 128, diastolic: 82 });
  });

  it('drops physiologically impossible values rather than saving them', () => {
    const result = parseOmronDisplay(idealDisplay('999', '82', '67'));
    expect(result.systolic).toBeNull();
    expect(result.warnings.some((w) => /implausible/i.test(w))).toBe(true);
  });

  it('warns instead of failing when the pulse is missing', () => {
    const tokens = [
      token('SYS', 20, 40, 18),
      token('128', 180, 30, 56),
      token('DIA', 20, 130, 18),
      token('82', 180, 120, 56),
    ];
    const result = parseOmronDisplay(tokens);
    expect(result).toMatchObject({ systolic: 128, diastolic: 82, pulse: null });
    expect(result.warnings.some((w) => /pulse/i.test(w))).toBe(true);
  });

  it('tolerates a tilted photo, where rows drift vertically', () => {
    const tokens = [
      token('SYS', 20, 40, 18),
      token('128', 180, 48, 56), // drifted down relative to its label
      token('DIA', 20, 130, 18),
      token('82', 180, 138, 56),
      token('PULSE', 20, 220, 18),
      token('67', 180, 228, 56),
    ];
    const result = parseOmronDisplay(tokens);
    expect(result).toMatchObject({ systolic: 128, diastolic: 82, pulse: 67 });
  });

  it('flags an unusual but possible reading rather than discarding it', () => {
    const result = parseOmronDisplay(idealDisplay('205', '118', '67'));
    expect(result).toMatchObject({ systolic: 205, diastolic: 118 });
    expect(result.warnings.some((w) => /unusual/i.test(w))).toBe(true);
  });

  it('reports honestly when the photo contains nothing readable', () => {
    const result = parseOmronDisplay([token('blurry', 10, 10, 20)]);
    expect(result).toMatchObject({ systolic: null, diastolic: null, pulse: null, confidence: 0 });
    expect(result.evidence.strategy).toBe('none');
  });

  it('lowers confidence when Vision itself was unsure', () => {
    const unsure = idealDisplay().map((t) => ({ ...t, confidence: 0.4 }));
    const confident = parseOmronDisplay(idealDisplay());
    const result = parseOmronDisplay(unsure);
    expect(result.confidence).toBeLessThan(confident.confidence);
    expect(result.warnings.some((w) => /light|glare/i.test(w))).toBe(true);
  });
});
