/**
 * The small amount of statistics the reports need.
 *
 * Written out rather than pulled from a library because it is about sixty lines and
 * the alternative is a dependency this app would otherwise not have. Every function
 * here is pure and covered by tests.
 */

export function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/** Sample variance (n-1). Zero for fewer than two values. */
export function variance(values: readonly number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  return values.reduce((sum, v) => sum + (v - m) ** 2, 0) / (values.length - 1);
}

export function standardDeviation(values: readonly number[]): number {
  return Math.sqrt(variance(values));
}

// --------------------------------------------------------------- distributions

/** Log-gamma, Lanczos approximation. */
function logGamma(x: number): number {
  const coefficients = [
    76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155,
    0.1208650973866179e-2, -0.5395239384953e-5,
  ];
  let y = x;
  const tmp = x + 5.5 - (x + 0.5) * Math.log(x + 5.5);
  let series = 1.000000000190015;
  for (const c of coefficients) series += c / ++y;
  return -tmp + Math.log((2.5066282746310005 * series) / x);
}

/** Continued fraction for the incomplete beta function (Lentz's method). */
function betaContinuedFraction(a: number, b: number, x: number): number {
  const MAX_ITERATIONS = 200;
  const EPSILON = 3e-12;
  const TINY = 1e-30;

  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < TINY) d = TINY;
  d = 1 / d;
  let h = d;

  for (let m = 1; m <= MAX_ITERATIONS; m++) {
    const m2 = 2 * m;
    let numerator = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + numerator * d;
    if (Math.abs(d) < TINY) d = TINY;
    c = 1 + numerator / c;
    if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d;
    h *= d * c;

    numerator = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + numerator * d;
    if (Math.abs(d) < TINY) d = TINY;
    c = 1 + numerator / c;
    if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d;
    const delta = d * c;
    h *= delta;

    if (Math.abs(delta - 1) < EPSILON) break;
  }
  return h;
}

/** Regularized incomplete beta function I_x(a, b). */
export function incompleteBeta(a: number, b: number, x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;

  const front = Math.exp(
    logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x),
  );
  // The continued fraction converges quickly only on one side of the mean; use the
  // symmetry I_x(a,b) = 1 - I_(1-x)(b,a) for the other.
  return x < (a + 1) / (a + b + 2)
    ? (front * betaContinuedFraction(a, b, x)) / a
    : 1 - (front * betaContinuedFraction(b, a, 1 - x)) / b;
}

export interface TTestResult {
  t: number;
  degreesOfFreedom: number;
  /** Two-tailed. */
  pValue: number;
}

/**
 * Welch's t-test - the unequal-variance form.
 *
 * Student's t assumes both groups have the same spread, which is exactly what we
 * cannot assume here: "readings when ill" is a handful of unusual days, "readings
 * when not ill" is everything else.
 */
export function welchTTest(a: readonly number[], b: readonly number[]): TTestResult | null {
  if (a.length < 2 || b.length < 2) return null;

  const varA = variance(a) / a.length;
  const varB = variance(b) / b.length;
  const denominator = varA + varB;
  // Both groups perfectly constant: the difference is real but a t-test cannot
  // describe it, so say nothing rather than divide by zero.
  if (denominator === 0) return null;

  const t = (mean(a) - mean(b)) / Math.sqrt(denominator);
  const degreesOfFreedom =
    denominator ** 2 / (varA ** 2 / (a.length - 1) + varB ** 2 / (b.length - 1));

  const pValue = incompleteBeta(
    degreesOfFreedom / 2,
    0.5,
    degreesOfFreedom / (degreesOfFreedom + t * t),
  );

  return { t, degreesOfFreedom, pValue: Math.min(1, Math.max(0, pValue)) };
}

// --------------------------------------------------------------- trend

export interface Trend {
  /** Change in y per unit of x. */
  slope: number;
  intercept: number;
}

/** Ordinary least squares. Returns null when the x values do not vary. */
export function linearRegression(points: readonly { x: number; y: number }[]): Trend | null {
  if (points.length < 2) return null;

  const meanX = mean(points.map((p) => p.x));
  const meanY = mean(points.map((p) => p.y));

  let numerator = 0;
  let denominator = 0;
  for (const point of points) {
    numerator += (point.x - meanX) * (point.y - meanY);
    denominator += (point.x - meanX) ** 2;
  }
  if (denominator === 0) return null;

  const slope = numerator / denominator;
  return { slope, intercept: meanY - slope * meanX };
}
