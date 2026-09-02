/**
 * Blood-pressure domain rules shared by every client and the API.
 *
 * NOTE: the categories below follow the ACC/AHA 2017 thresholds. They are here to
 * colour a chart and start a conversation with a doctor - never to diagnose.
 */

/** Widest values we will accept from OCR or a human. Anything outside is a typo or a misread. */
export const PLAUSIBLE = {
  systolic: { min: 60, max: 260 },
  diastolic: { min: 30, max: 200 },
  pulse: { min: 25, max: 220 },
} as const;

export type BpCategory =
  | 'normal'
  | 'elevated'
  | 'hypertension_1'
  | 'hypertension_2'
  | 'crisis';

export const BP_CATEGORY_LABEL: Record<BpCategory, string> = {
  normal: 'Normal',
  elevated: 'Elevated',
  hypertension_1: 'Hypertension stage 1',
  hypertension_2: 'Hypertension stage 2',
  crisis: 'Hypertensive crisis',
};

/** Colour-blind-safe ramp, ordered from calm to alarming. Shared by web and mobile. */
export const BP_CATEGORY_COLOR: Record<BpCategory, string> = {
  normal: '#1a7f5a',
  elevated: '#a07d1e',
  hypertension_1: '#c2610f',
  hypertension_2: '#c0392b',
  crisis: '#7b1d13',
};

export function classify(systolic: number, diastolic: number): BpCategory {
  if (systolic > 180 || diastolic > 120) return 'crisis';
  if (systolic >= 140 || diastolic >= 90) return 'hypertension_2';
  if (systolic >= 130 || diastolic >= 80) return 'hypertension_1';
  if (systolic >= 120) return 'elevated';
  return 'normal';
}

/** Mean arterial pressure - a single number that is sometimes easier to trend than two. */
export function meanArterialPressure(systolic: number, diastolic: number): number {
  return Math.round((diastolic * 2 + systolic) / 3);
}

export function pulsePressure(systolic: number, diastolic: number): number {
  return systolic - diastolic;
}

export interface BpProblem {
  field: 'systolic' | 'diastolic' | 'pulse' | 'pair';
  message: string;
}

/**
 * Structural sanity checks. Returns every problem found rather than the first,
 * so a confirmation screen can flag all the bad fields at once.
 */
export function validateReading(input: {
  systolic: number;
  diastolic: number;
  pulse?: number | null;
}): BpProblem[] {
  const problems: BpProblem[] = [];
  const check = (
    field: 'systolic' | 'diastolic' | 'pulse',
    value: number,
    range: { min: number; max: number },
  ) => {
    if (!Number.isInteger(value)) {
      problems.push({ field, message: `${field} must be a whole number` });
    } else if (value < range.min || value > range.max) {
      problems.push({
        field,
        message: `${field} of ${value} is outside the plausible range ${range.min}-${range.max}`,
      });
    }
  };

  check('systolic', input.systolic, PLAUSIBLE.systolic);
  check('diastolic', input.diastolic, PLAUSIBLE.diastolic);
  if (input.pulse != null) check('pulse', input.pulse, PLAUSIBLE.pulse);

  if (problems.length === 0 && input.systolic <= input.diastolic) {
    problems.push({
      field: 'pair',
      message: 'Systolic must be higher than diastolic - the two may have been swapped',
    });
  }
  return problems;
}
