/**
 * Turns OCR tokens from a photo of an Omron monitor into three numbers.
 *
 * This exists because Cloud Vision reads *text*, and a blood-pressure monitor shows
 * seven-segment glyphs at whatever angle you happened to hold the phone. Vision will
 * happily return "l2O" for 120, put the pulse before the systolic, or throw the
 * clock on the display into the middle of the results. So we ignore Vision's reading
 * order entirely and reconstruct the display from geometry instead.
 *
 * Omron units, across every model I have seen, share a layout:
 *
 *     SYS    mmHg      120     <- largest glyphs, top
 *     DIA    mmHg       80     <- same column, below
 *     PULSE  /min       64     <- same column, bottom
 *
 * That gives three independent signals - printed labels, vertical order, and glyph
 * size - and the parser uses whichever are available, degrading gracefully.
 *
 * Pure and dependency-free on purpose: every branch here is unit-testable against
 * real captures without touching the network.
 */

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A polygon corner, in image pixels. */
export interface Vertex {
  x: number;
  y: number;
}

export interface OcrToken {
  text: string;
  /** Vision's own 0-1 confidence, when it gave one. TEXT_DETECTION returns 0. */
  confidence: number;
  box: BoundingBox;
  /**
   * Vision's quadrilateral for the word, corners in the text's own reading order:
   * v0 and v1 run along the top of the glyphs, left to right *as the text reads*.
   * So v0 -> v1 is a baseline vector, and it is the only thing in the response
   * that says which way up the display was. Optional, because older captures were
   * stored without it; without it the parser assumes the photo was upright.
   */
  poly?: readonly Vertex[];
}

export interface ParsedReading {
  systolic: number | null;
  diastolic: number | null;
  pulse: number | null;
  /** 0-1. Never reaches 1: the confirm screen is always shown. */
  confidence: number;
  warnings: string[];
  /** How each number was arrived at, for debugging against stored scans. */
  evidence: {
    strategy: 'labels' | 'column' | 'vertical' | 'none';
    correctedGlyphs: boolean;
    candidateCount: number;
    /** Quarter-turns clockwise applied to the geometry before anything was read. */
    quarterTurns: 0 | 1 | 2 | 3;
  };
}

/** Structurally possible values. Wider than typical - people do have a reading of 200. */
const RANGE = {
  systolic: { min: 60, max: 260 },
  diastolic: { min: 30, max: 200 },
  pulse: { min: 25, max: 220 },
} as const;

/** What we expect to see most days. Outside this we still accept, but we warn. */
const TYPICAL = {
  systolic: { min: 85, max: 200 },
  diastolic: { min: 45, max: 125 },
  pulse: { min: 40, max: 130 },
} as const;

/**
 * Letters Vision commonly returns for seven-segment digits. Applied only when the
 * substitution turns the whole token into a plausible number, so "SYS" is never
 * mangled into "545".
 */
const GLYPH_CONFUSIONS: Record<string, string> = {
  O: '0', o: '0', D: '0', Q: '0', U: '0',
  I: '1', l: '1', i: '1', '|': '1', ']': '1', '[': '1', '!': '1',
  Z: '2', z: '2',
  E: '3',
  A: '4', h: '4',
  S: '5', s: '5',
  G: '6', b: '6', C: '6',
  T: '7', '?': '7',
  B: '8', R: '8', '&': '8',
  g: '9', q: '9',
};

/**
 * Printed labels, allowing for a clipped first letter.
 *
 * The labels sit at the very edge of the bezel, so the leading glyph is routinely
 * the one lost to a shadow or a thumb - the first real capture came back with
 * "ULSE", which the old `^(pulse|puls|pul)$` refused, and that alone cost us the
 * pulse. Dropping the optional first letter is safe here: nothing else on an Omron
 * reads as "ys", "ia" or "ulse".
 */
const LABEL_PATTERNS: Record<'systolic' | 'diastolic' | 'pulse', RegExp> = {
  systolic: /^s?ys(t(olic)?)?$/i,
  diastolic: /^d?ia(s(tolic)?)?$/i,
  pulse: /^(p?ul(s|se)?|bpm)$/i,
};

interface NumberCandidate {
  value: number;
  confidence: number;
  box: BoundingBox;
  corrected: boolean;
}

interface LabelHit {
  kind: 'systolic' | 'diastolic' | 'pulse';
  box: BoundingBox;
}

const centreY = (b: BoundingBox) => b.y + b.height / 2;
const centreX = (b: BoundingBox) => b.x + b.width / 2;

type QuarterTurns = 0 | 1 | 2 | 3;

/**
 * Which way up the display was, in quarter-turns clockwise.
 *
 * This is the bug that made the whole feature look broken. A phone always writes
 * its sensor's landscape pixels and records the rotation in an EXIF tag; Cloud
 * Vision reads the pixels and ignores the tag. So a photo taken in portrait - which
 * is how you hold a phone over a monitor sitting on a table - reaches the parser
 * lying on its side, and every "above", "below" and "taller than" below is ninety
 * degrees out. The first real capture came back 94/134 with no pulse, from a photo
 * Vision had in fact read perfectly: 134, 94, 79.
 *
 * We do not need the EXIF tag to work it out, and are better off not using it.
 * Vision returns each word as a quadrilateral in reading order, so v0 -> v1 is a
 * baseline vector. Every word on an Omron - the brand, the labels, the digits - is
 * printed the same way up, so the longest run of text wins the vote. That covers
 * what EXIF cannot: a monitor photographed sideways within an upright frame, or a
 * screenshot that has already been rotated and had its tag stripped.
 */
function detectQuarterTurns(tokens: readonly OcrToken[]): QuarterTurns {
  // Weighted by baseline length, so "OMRON" and "134" outvote a stray "/".
  const weights: Record<QuarterTurns, number> = { 0: 0, 1: 0, 2: 0, 3: 0 };

  for (const token of tokens) {
    const poly = token.poly;
    if (!poly || poly.length < 2) continue;
    const dx = poly[1]!.x - poly[0]!.x;
    const dy = poly[1]!.y - poly[0]!.y;
    const length = Math.hypot(dx, dy);
    if (length < 1) continue;
    // Image coordinates put y downwards, so a clockwise turn *adds* to the angle;
    // the turns we need are therefore the negation of the baseline's own angle.
    const degrees = (Math.atan2(dy, dx) * 180) / Math.PI;
    const turns = ((((Math.round(-degrees / 90) % 4) + 4) % 4) as QuarterTurns);
    weights[turns] += length;
  }

  let best: QuarterTurns = 0;
  for (const turns of [1, 2, 3] as const) {
    if (weights[turns] > weights[best]) best = turns;
  }
  return best;
}

/** Rotates a point clockwise about the origin. */
function rotatePoint(x: number, y: number, turns: QuarterTurns): Vertex {
  switch (turns) {
    case 1:
      return { x: -y, y: x };
    case 2:
      return { x: -x, y: -y };
    case 3:
      return { x: y, y: -x };
    default:
      return { x, y };
  }
}

/**
 * Re-expresses every box in display coordinates: x across the readout, y down it.
 *
 * The result is not shifted back into positive space, because it does not need to
 * be - nothing downstream does anything with a box but compare it against another.
 */
function uprightTokens(tokens: readonly OcrToken[], turns: QuarterTurns): OcrToken[] {
  if (turns === 0) return [...tokens];
  return tokens.map((token) => {
    const { x, y, width, height } = token.box;
    const corners =
      token.poly && token.poly.length >= 3
        ? token.poly
        : [
            { x, y },
            { x: x + width, y },
            { x: x + width, y: y + height },
            { x, y: y + height },
          ];
    const turned = corners.map((v) => rotatePoint(v.x, v.y, turns));
    const xs = turned.map((p) => p.x);
    const ys = turned.map((p) => p.y);
    const left = Math.min(...xs);
    const top = Math.min(...ys);
    return {
      ...token,
      box: { x: left, y: top, width: Math.max(...xs) - left, height: Math.max(...ys) - top },
    };
  });
}

/** Maps confusable letters to digits, reporting whether anything was changed. */
function coerceToDigits(raw: string): { digits: string; corrected: boolean } {
  let corrected = false;
  let out = '';
  for (const ch of raw) {
    if (ch >= '0' && ch <= '9') {
      out += ch;
    } else if (GLYPH_CONFUSIONS[ch] !== undefined) {
      out += GLYPH_CONFUSIONS[ch];
      corrected = true;
    } else {
      return { digits: '', corrected: false };
    }
  }
  return { digits: out, corrected };
}

/**
 * Extracts every number a token could contain. Handles the two forms Vision emits:
 * a bare number, and a combined "120/80" that some models print.
 */
function candidatesFromToken(token: OcrToken): NumberCandidate[] {
  const cleaned = token.text.trim().replace(/[.,\s]/g, '');
  if (cleaned.length === 0) return [];

  // A printed label is never a number, whatever it looks like under substitution.
  // "DIA" coerces to 014 (D->0, I->1, A->4), which the real capture duly offered up
  // as a candidate; it was only kept out of the answer by the plausibility check.
  if (isLabelWord(cleaned)) return [];

  const parts = cleaned.split('/').filter(Boolean);
  const results: NumberCandidate[] = [];

  // A split token's halves share one bounding box; we slice it horizontally so the
  // geometry stays roughly honest.
  const sliceWidth = token.box.width / Math.max(parts.length, 1);

  parts.forEach((part, index) => {
    const { digits, corrected } = coerceToDigits(part);
    if (digits.length < 2 || digits.length > 3) return;
    // No Omron value is written with a leading zero. The clock is, which is a
    // further reason to drop them.
    if (digits.startsWith('0')) return;
    const value = Number.parseInt(digits, 10);
    if (!Number.isFinite(value)) return;
    results.push({
      value,
      confidence: token.confidence,
      corrected,
      box:
        parts.length === 1
          ? token.box
          : { ...token.box, x: token.box.x + sliceWidth * index, width: sliceWidth },
    });
  });

  return results;
}

function isLabelWord(raw: string): boolean {
  const word = raw.replace(/[^a-z]/gi, '');
  if (!word) return false;
  return Object.values(LABEL_PATTERNS).some((pattern) => pattern.test(word));
}

function findLabels(tokens: readonly OcrToken[]): LabelHit[] {
  const hits: LabelHit[] = [];
  for (const token of tokens) {
    const word = token.text.trim().replace(/[^a-z]/gi, '');
    if (!word) continue;
    for (const [kind, pattern] of Object.entries(LABEL_PATTERNS)) {
      if (pattern.test(word)) {
        hits.push({ kind: kind as LabelHit['kind'], box: token.box });
        break;
      }
    }
  }
  return hits;
}

/**
 * Strategy 1 - trust the printed labels.
 *
 * For each label found, take the number sharing its line. Omron prints the label to
 * the left of its value, so we search rightward first.
 *
 * "Sharing its line" means the two boxes overlap vertically, not that their centres
 * are close. The value is printed three or four times the height of the label
 * beside it, so its centre sits well below the label's - comparing centres, which
 * is what this did originally, put SYS's own number out of reach and dropped the
 * parser into its geometric fallback on every real photo. Centre distance survives
 * only as a fallback, for a photo tilted enough that the spans just miss.
 */
function assignByLabels(
  labels: readonly LabelHit[],
  candidates: readonly NumberCandidate[],
): Partial<Record<LabelHit['kind'], NumberCandidate>> {
  const assigned: Partial<Record<LabelHit['kind'], NumberCandidate>> = {};
  const taken = new Set<NumberCandidate>();

  const overlapWith = (label: LabelHit, c: NumberCandidate) =>
    Math.min(label.box.y + label.box.height, c.box.y + c.box.height) -
    Math.max(label.box.y, c.box.y);

  for (const label of labels) {
    if (assigned[label.kind]) continue;
    const labelY = centreY(label.box);
    // Tolerance scales with the label's own height, so it works at any resolution.
    const tolerance = Math.max(label.box.height * 1.6, 12);

    const sameLine = candidates
      .filter(
        (c) => !taken.has(c) && (overlapWith(label, c) > 0 || Math.abs(centreY(c.box) - labelY) <= tolerance),
      )
      .filter((c) => inAnyRange(c.value))
      .sort((a, b) => {
        // Prefer numbers to the right of the label, then by proximity.
        const aRight = centreX(a.box) > centreX(label.box) ? 0 : 1;
        const bRight = centreX(b.box) > centreX(label.box) ? 0 : 1;
        if (aRight !== bRight) return aRight - bRight;
        // Then the one that shares most of the label's line...
        const overlap = overlapWith(label, b) - overlapWith(label, a);
        if (overlap !== 0) return overlap;
        // ...and only then the nearest horizontally.
        return Math.abs(centreX(a.box) - centreX(label.box)) - Math.abs(centreX(b.box) - centreX(label.box));
      });

    const match = sameLine[0];
    if (match) {
      assigned[label.kind] = match;
      taken.add(match);
    }
  }
  return assigned;
}

function inAnyRange(value: number): boolean {
  return (
    (value >= RANGE.diastolic.min && value <= RANGE.systolic.max) ||
    (value >= RANGE.pulse.min && value <= RANGE.pulse.max)
  );
}

/**
 * Strategy 2 - the biggest column of numbers.
 *
 * The main readout is set in far larger type than the clock or the memory index, and
 * the three values share a right-hand alignment. So: keep the tallest glyphs, group
 * what is left into vertical columns, and take the fullest column top to bottom.
 */
function assignByColumn(candidates: readonly NumberCandidate[]): NumberCandidate[] {
  if (candidates.length === 0) return [];

  const tallest = Math.max(...candidates.map((c) => c.box.height));
  // Anything under 55% of the tallest glyph is chrome: date, time, memory slot.
  const large = candidates.filter((c) => c.box.height >= tallest * 0.55);
  if (large.length === 0) return [];

  const columnWidth = Math.max(...large.map((c) => c.box.width)) * 1.8;
  const columns: NumberCandidate[][] = [];

  for (const candidate of [...large].sort((a, b) => centreX(a.box) - centreX(b.box))) {
    const column = columns.find(
      (col) => Math.abs(centreX(col[0]!.box) - centreX(candidate.box)) <= columnWidth,
    );
    if (column) column.push(candidate);
    else columns.push([candidate]);
  }

  const best = columns.sort((a, b) => b.length - a.length)[0] ?? [];
  return [...best].sort((a, b) => centreY(a.box) - centreY(b.box));
}

function within(value: number, range: { min: number; max: number }): boolean {
  return value >= range.min && value <= range.max;
}

export function parseOmronDisplay(rawTokens: readonly OcrToken[]): ParsedReading {
  const warnings: string[] = [];

  // Everything below reasons about above, below and taller-than, so the very first
  // thing to do is agree on which way is up. See detectQuarterTurns.
  const quarterTurns = detectQuarterTurns(rawTokens);
  const tokens = uprightTokens(rawTokens, quarterTurns);

  const candidates = tokens.flatMap(candidatesFromToken);

  if (candidates.length === 0) {
    return {
      systolic: null,
      diastolic: null,
      pulse: null,
      confidence: 0,
      warnings: ['No numbers were found in the photo. Try again with the display better lit.'],
      evidence: { strategy: 'none', correctedGlyphs: false, candidateCount: 0, quarterTurns },
    };
  }

  const labels = findLabels(tokens);
  const byLabel = assignByLabels(labels, candidates);
  const labelHits = Object.keys(byLabel).length;

  let systolic: NumberCandidate | null = null;
  let diastolic: NumberCandidate | null = null;
  let pulse: NumberCandidate | null = null;
  let strategy: ParsedReading['evidence']['strategy'] = 'none';

  // Two labels are enough to trust the layout; one could be a coincidence.
  if (labelHits >= 2) {
    strategy = 'labels';
    systolic = byLabel.systolic ?? null;
    diastolic = byLabel.diastolic ?? null;
    pulse = byLabel.pulse ?? null;
  }

  if (!systolic || !diastolic) {
    const column = assignByColumn(candidates);
    if (column.length >= 2) {
      strategy = strategy === 'labels' ? 'labels' : 'column';
      // Fill only the gaps, so a confident label match is never overwritten.
      systolic ??= column[0] ?? null;
      diastolic ??= column[1] ?? null;
      pulse ??= column[2] ?? null;
      if (column.length > 3) {
        warnings.push('More numbers were visible than expected - check them against the display.');
      }
    } else {
      strategy = 'vertical';
      const ordered = [...candidates].sort((a, b) => centreY(a.box) - centreY(b.box));
      systolic ??= ordered[0] ?? null;
      diastolic ??= ordered[1] ?? null;
      pulse ??= ordered[2] ?? null;
    }
  }

  // Systolic below diastolic means the two rows were read out of order - a common
  // outcome on a photo taken upside-down or at a steep angle. Swapping is safe
  // because the alternative is a physiologically impossible pair.
  let swapped = false;
  if (systolic && diastolic && systolic.value < diastolic.value) {
    [systolic, diastolic] = [diastolic, systolic];
    swapped = true;
    warnings.push('The top two numbers looked swapped and were reordered - please check.');
  }

  // Drop anything outside what a human body produces rather than saving a misread.
  if (systolic && !within(systolic.value, RANGE.systolic)) {
    warnings.push(`Ignored an implausible systolic value of ${systolic.value}.`);
    systolic = null;
  }
  if (diastolic && !within(diastolic.value, RANGE.diastolic)) {
    warnings.push(`Ignored an implausible diastolic value of ${diastolic.value}.`);
    diastolic = null;
  }
  if (pulse && !within(pulse.value, RANGE.pulse)) {
    warnings.push(`Ignored an implausible pulse value of ${pulse.value}.`);
    pulse = null;
  }
  if (systolic && diastolic && systolic.value === diastolic.value) {
    warnings.push('The two pressure numbers came out identical - one was misread.');
    diastolic = null;
  }

  const chosen = [systolic, diastolic, pulse].filter((c): c is NumberCandidate => c !== null);
  const correctedGlyphs = chosen.some((c) => c.corrected);

  // --- confidence -----------------------------------------------------------
  // Starts from what Vision thought, then moves on how much corroborating
  // structure we found. It is capped below 1: a human confirms every reading.
  //
  // TEXT_DETECTION reports a flat zero for every word - it only fills confidence in
  // under DOCUMENT_TEXT_DETECTION - so "no score" has to mean no score, not a bad
  // one. Reading 0 as 0.5 made a pin-sharp photo score 0.5 and warned the user
  // about glare that was not there.
  const scored = chosen.filter((c) => c.confidence > 0);
  const visionConfidence = scored.length
    ? scored.reduce((sum, c) => sum + c.confidence, 0) / scored.length
    : null;

  const atypical =
    (systolic && !within(systolic.value, TYPICAL.systolic)) ||
    (diastolic && !within(diastolic.value, TYPICAL.diastolic)) ||
    (pulse && !within(pulse.value, TYPICAL.pulse));

  // Corroborating structure nudges the score up or down...
  let confidence = visionConfidence ?? 0.5;
  if (strategy === 'labels') confidence += 0.15;
  if (systolic && diastolic && pulse) confidence += 0.1;
  if (atypical) confidence -= 0.15;

  // ...but some findings are not nudges. If we had to guess at a digit, no amount
  // of tidy layout makes the result trustworthy, so these impose a ceiling rather
  // than a deduction - otherwise a well-lit photo of a misread digit scores as
  // highly as a correct one.
  const ceilings: number[] = [0.97];
  if (correctedGlyphs) ceilings.push(0.65);
  if (strategy === 'vertical') ceilings.push(0.6);
  if (swapped) ceilings.push(0.7);
  if (!systolic || !diastolic) ceilings.push(0.3);
  confidence = Math.min(confidence, ...ceilings);

  // --- warnings the confirm screen shows ------------------------------------
  if (!systolic || !diastolic) {
    warnings.push('The pressure numbers could not be read - please type them in.');
  }
  if (!pulse) {
    warnings.push('No pulse was found. Add it by hand if your monitor showed one.');
  }
  if (strategy === 'vertical') {
    warnings.push('The display layout was unclear, so the numbers were read top to bottom.');
  }
  if (correctedGlyphs) {
    warnings.push('Some digits were ambiguous and had to be guessed - check them closely.');
  }
  if (atypical) {
    warnings.push('One of these values is unusual. Worth a second look before saving.');
  }
  if (visionConfidence !== null && visionConfidence < 0.6) {
    warnings.push('The photo was hard to read. More light or less glare would help.');
  }

  return {
    systolic: systolic?.value ?? null,
    diastolic: diastolic?.value ?? null,
    pulse: pulse?.value ?? null,
    confidence: Math.max(0.02, Number(confidence.toFixed(2))),
    warnings,
    evidence: { strategy, correctedGlyphs, candidateCount: candidates.length, quarterTurns },
  };
}
