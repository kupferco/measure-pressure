import { describe, expect, it } from 'vitest';
import type { Reading } from '@mp/shared';
import { buildDiary } from './diary';

function reading(measuredAt: string, systolic: number, diastolic: number, sessionId = 's1'): Reading {
  return {
    id: `${measuredAt}-${systolic}`,
    userId: 'u1',
    sessionId,
    systolic,
    diastolic,
    pulse: 70,
    measuredAt,
    note: null,
    tagIds: [],
    tags: [],
    arm: 'unknown',
    posture: 'unknown',
    source: 'manual',
    imageUrl: null,
    ocrConfidence: null,
    ocrCorrected: false,
    createdAt: measuredAt,
  };
}

describe('buildDiary', () => {
  it('puts readings in the right part of the day', () => {
    const rows = buildDiary(
      [
        reading('2026-09-02T08:00:00Z', 130, 82),
        reading('2026-09-02T14:00:00Z', 125, 80),
        reading('2026-09-02T20:00:00Z', 120, 78),
        reading('2026-09-02T23:30:00Z', 118, 76),
      ],
      'UTC',
    );
    expect(rows).toHaveLength(1);
    const { slots } = rows[0]!;
    expect(slots.morning?.systolic).toBe(130);
    expect(slots.afternoon?.systolic).toBe(125);
    expect(slots.evening?.systolic).toBe(120);
    expect(slots.night?.systolic).toBe(118);
  });

  it('averages several readings in the same slot and says how many', () => {
    const rows = buildDiary(
      [
        reading('2026-09-02T08:00:00Z', 140, 90),
        reading('2026-09-02T08:01:00Z', 134, 86),
        reading('2026-09-02T08:02:00Z', 132, 84),
      ],
      'UTC',
    );
    const cell = rows[0]!.slots.morning!;
    expect(cell.systolic).toBeCloseTo(135.33, 1);
    expect(cell.readings).toBe(3);
    expect(cell.sittings).toBe(1);
  });

  it('counts separate sittings within one slot', () => {
    const rows = buildDiary(
      [
        reading('2026-09-02T07:00:00Z', 140, 90, 'a'),
        reading('2026-09-02T11:00:00Z', 130, 82, 'b'),
      ],
      'UTC',
    );
    expect(rows[0]!.slots.morning!.sittings).toBe(2);
  });

  /*
   * The reason this module uses Intl rather than the Date getters. 23:30 UTC on
   * 2 September is 00:30 on 3 September in Lisbon - a different day, and night
   * rather than evening. Slicing the ISO string would file it under the wrong day.
   */
  it('groups by the local day of the viewer, not by UTC', () => {
    const late = [reading('2026-09-02T23:30:00Z', 118, 76)];

    const utc = buildDiary(late, 'UTC');
    expect(utc[0]!.day).toBe('2026-09-02');
    expect(utc[0]!.slots.night).toBeDefined();

    const lisbon = buildDiary(late, 'Europe/Lisbon');
    expect(lisbon[0]!.day).toBe('2026-09-03');
    expect(lisbon[0]!.slots.night).toBeDefined();

    // And west of Greenwich the same instant is still the evening before.
    const saoPaulo = buildDiary(late, 'America/Sao_Paulo');
    expect(saoPaulo[0]!.day).toBe('2026-09-02');
    expect(saoPaulo[0]!.slots.evening).toBeDefined();
  });

  it('handles midnight without falling off the end of the clock', () => {
    const rows = buildDiary([reading('2026-09-02T00:00:00Z', 118, 76)], 'UTC');
    expect(rows[0]!.day).toBe('2026-09-02');
    expect(rows[0]!.slots.night?.systolic).toBe(118);
  });

  it('returns the most recent day first', () => {
    const rows = buildDiary(
      [
        reading('2026-08-30T08:00:00Z', 130, 82),
        reading('2026-09-02T08:00:00Z', 125, 80),
        reading('2026-09-01T08:00:00Z', 128, 81),
      ],
      'UTC',
    );
    expect(rows.map((r) => r.day)).toEqual(['2026-09-02', '2026-09-01', '2026-08-30']);
  });

  it('falls back to UTC rather than throwing on a nonsense zone', () => {
    const rows = buildDiary([reading('2026-09-02T08:00:00Z', 130, 82)], 'Not/AZone');
    expect(rows[0]!.day).toBe('2026-09-02');
  });

  it('has nothing to say about no readings', () => {
    expect(buildDiary([], 'UTC')).toEqual([]);
  });
});
