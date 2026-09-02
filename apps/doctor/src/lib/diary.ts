import type { Reading } from '@mp/shared';

/**
 * Turns a flat list of readings into the grid a blood-pressure diary actually
 * takes: one row per day, one column per part of the day.
 *
 * This is the shape a clinician reads. A chronological list makes them do the
 * grouping in their head during an appointment; a grid makes "his mornings are
 * always high" visible without arithmetic.
 */

export const SLOTS = ['morning', 'afternoon', 'evening', 'night'] as const;
export type Slot = (typeof SLOTS)[number];

export const SLOT_LABEL: Record<Slot, string> = {
  morning: 'Morning',
  afternoon: 'Afternoon',
  evening: 'Evening',
  night: 'Night',
};

export const SLOT_HOURS: Record<Slot, string> = {
  morning: '5am–12pm',
  afternoon: '12–6pm',
  evening: '6–10pm',
  night: '10pm–5am',
};

export interface Cell {
  systolic: number;
  diastolic: number;
  pulse: number | null;
  /** How many individual measurements are behind this average. */
  readings: number;
  /** Sittings, in case someone measured twice in the same part of the day. */
  sittings: number;
  notes: string[];
  tags: string[];
}

export interface DiaryRow {
  /** Local calendar day, ISO yyyy-mm-dd. */
  day: string;
  slots: Partial<Record<Slot, Cell>>;
}

function slotFor(hour: number): Slot {
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 18) return 'afternoon';
  if (hour >= 18 && hour < 22) return 'evening';
  return 'night';
}

/**
 * Local parts of a timestamp in the given zone.
 *
 * Uses Intl rather than the Date getters so the grouping follows the zone the
 * report is being read in, not whatever the server or browser defaults to. A
 * reading at 00:30 belongs to the night of the day it was taken locally, which
 * naive UTC slicing gets wrong for anyone east or west of Greenwich.
 */
function localParts(iso: string, timeZone: string): { day: string; hour: number } {
  const date = new Date(iso);
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hour12: false,
    }).formatToParts(date);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
    // en-CA renders 24-hour midnight as "24" in some engines.
    const hour = Number.parseInt(get('hour'), 10) % 24;
    return { day: `${get('year')}-${get('month')}-${get('day')}`, hour };
  } catch {
    return { day: date.toISOString().slice(0, 10), hour: date.getUTCHours() };
  }
}

const mean = (values: number[]) => values.reduce((sum, v) => sum + v, 0) / values.length;

export function buildDiary(readings: readonly Reading[], timeZone: string): DiaryRow[] {
  // Group by day, then by slot, keeping the raw readings so each cell can report
  // how many measurements it averages.
  const days = new Map<string, Map<Slot, Reading[]>>();

  for (const reading of readings) {
    const { day, hour } = localParts(reading.measuredAt, timeZone);
    const slot = slotFor(hour);
    const slots = days.get(day) ?? new Map<Slot, Reading[]>();
    slots.set(slot, [...(slots.get(slot) ?? []), reading]);
    days.set(day, slots);
  }

  return [...days.entries()]
    .map(([day, slots]) => ({
      day,
      slots: Object.fromEntries(
        [...slots.entries()].map(([slot, group]) => {
          const pulses = group.map((r) => r.pulse).filter((p): p is number => p != null);
          return [
            slot,
            {
              systolic: mean(group.map((r) => r.systolic)),
              diastolic: mean(group.map((r) => r.diastolic)),
              pulse: pulses.length > 0 ? mean(pulses) : null,
              readings: group.length,
              sittings: new Set(group.map((r) => r.sessionId)).size,
              notes: group.map((r) => r.note).filter((n): n is string => Boolean(n)),
              tags: [...new Set(group.flatMap((r) => r.tags.map((t) => t.label)))],
            } satisfies Cell,
          ];
        }),
      ) as Partial<Record<Slot, Cell>>,
    }))
    // Most recent first: the appointment is about now, not about March.
    .sort((a, b) => b.day.localeCompare(a.day));
}
