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

export interface OcrToken {
  text: string;
  /** Vision's own 0-1 confidence, when it gave one. */
  confidence: number;
  box: BoundingBox;
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

const LABEL_PATTERNS: Record<'systolic' | 'diastolic' | 'pulse', RegExp> = {
  systolic: /^sys(t(olic)?)?$/i,
  diastolic: /^dia(s(tolic)?)?$/i,
  pulse: /^(pulse|puls|pul|bpm)$/i,
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

  const parts = cleaned.split('/').filter(Boolean);
  const results: NumberCandidate[] = [];

  // A split token's halves share one bounding box; we slice it horizontally so the
  // geometry stays roughly honest.
  const sliceWidth = token.box.width / Math.max(parts.length, 1);

  parts.forEach((part, index) => {
    const { digits, corrected } = coerceToDigits(part);
    if (digits.length < 2 || digits.length > 3) return;
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
 * For each label found, take the nearest number on roughly the same horizontal
 * line. Omron prints the label to the left of its value, so we search rightward
 * first and allow a generous vertical tolerance for a tilted photo.
 */
function assignByLabels(
  labels: readonly LabelHit[],
  candidates: readonly NumberCandidate[],
): Partial<Record<LabelHit['kind'], NumberCandidate>> {
  const assigned: Partial<Record<LabelHit['kind'], NumberCandidate>> = {};
  const taken = new Set<NumberCandidate>();

  for (const label of labels) {
    if (assigned[label.kind]) continue;
    const labelY = centreY(label.box);
    // Tolerance scales with the label's own height, so it works at any resolution.
    const tolerance = Math.max(label.box.height * 1.6, 12);

    const sameLine = candidates
      .filter((c) => !taken.has(c) && Math.abs(centreY(c.box) - labelY) <= tolerance)
      .filter((c) => inAnyRange(c.value))
      .sort((a, b) => {
        // Prefer numbers to the right of the label, then by proximity.
        const aRight = centreX(a.box) > centreX(label.box) ? 0 : 1;
        const bRight = centreX(b.box) > centreX(label.box) ? 0 : 1;
        if (aRight !== bRight) return aRight - bRight;
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

export function parseOmronDisplay(tokens: readonly OcrToken[]): ParsedReading {
  const warnings: string[] = [];
  const candidates = tokens.flatMap(candidatesFromToken);

  if (candidates.length === 0) {
    return {
      systolic: null,
      diastolic: null,
      pulse: null,
      confidence: 0,
      warnings: ['No numbers were found in the photo. Try again with the display better lit.'],
      evidence: { strategy: 'none', correctedGlyphs: false, candidateCount: 0 },
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
  const visionConfidence =
    chosen.length > 0
      ? chosen.reduce((sum, c) => sum + (c.confidence > 0 ? c.confidence : 0.5), 0) / chosen.length
      : 0;

  const atypical =
    (systolic && !within(systolic.value, TYPICAL.systolic)) ||
    (diastolic && !within(diastolic.value, TYPICAL.diastolic)) ||
    (pulse && !within(pulse.value, TYPICAL.pulse));

  // Corroborating structure nudges the score up or down...
  let confidence = visionConfidence || 0.5;
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
  if (visionConfidence > 0 && visionConfidence < 0.6) {
    warnings.push('The photo was hard to read. More light or less glare would help.');
  }

  return {
    systolic: systolic?.value ?? null,
    diastolic: diastolic?.value ?? null,
    pulse: pulse?.value ?? null,
    confidence: Math.max(0.02, Number(confidence.toFixed(2))),
    warnings,
    evidence: { strategy, correctedGlyphs, candidateCount: candidates.length },
  };
}
