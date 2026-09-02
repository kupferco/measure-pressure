/**
 * The time windows the charts can show, in the order they appear.
 *
 * Short labels because four of them have to fit across a narrow phone; the exact
 * dates are spelled out under the chart, so nothing depends on decoding "6M".
 */
export const RANGES = [
  { id: 'week', label: 'W', days: 7, spoken: 'the last 7 days' },
  { id: 'month', label: 'M', days: 30, spoken: 'the last 30 days' },
  { id: 'sixMonths', label: '6M', days: 182, spoken: 'the last 6 months' },
  { id: 'year', label: 'Y', days: 365, spoken: 'the last year' },
] as const;

export type RangeId = (typeof RANGES)[number]['id'];
export const DEFAULT_RANGE: RangeId = 'week';

export function rangeDays(id: RangeId): number {
  return RANGES.find((r) => r.id === id)?.days ?? 7;
}

export function rangeSpoken(id: RangeId): string {
  return RANGES.find((r) => r.id === id)?.spoken ?? '';
}

/** Keeps whatever falls inside the window, measured back from now. */
export function withinRange<T extends { measuredAt: string }>(
  items: readonly T[],
  id: RangeId,
): T[] {
  const cutoff = Date.now() - rangeDays(id) * 86_400_000;
  return items.filter((item) => new Date(item.measuredAt).getTime() >= cutoff);
}

/** "1 Aug – 2 Sep", for the caption under the chart. */
export function describeWindow(id: RangeId): string {
  const to = new Date();
  const from = new Date(to.getTime() - rangeDays(id) * 86_400_000);
  const short = (d: Date) =>
    d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  const withYear = (d: Date) =>
    d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  return from.getFullYear() === to.getFullYear()
    ? `${short(from)} – ${short(to)}`
    : `${withYear(from)} – ${withYear(to)}`;
}
