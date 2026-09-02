import {
  BP_CATEGORY_LABEL,
  classify,
  type Insight,
  type ReportQuery,
  type Summary,
  type TimeBucket,
  type User,
} from '@mp/shared';
import { query } from '../../db/pool.js';
import { resolveSubject } from '../../lib/access.js';
import { linearRegression, mean, welchTTest } from '../../lib/stats.js';

interface ReportRow {
  id: string;
  session_id: string;
  systolic: number;
  diastolic: number;
  pulse: number | null;
  measured_at: Date;
  tag_ids: string[] | null;
  tag_labels: string[] | null;
}

/**
 * Everything the reports need, in one pass over the readings.
 *
 * Aggregating in JavaScript rather than SQL is a deliberate trade: a personal
 * history is a few thousand rows at most, and the arithmetic is far easier to read
 * - and to test - than the equivalent window functions.
 */
async function fetchReadings(actor: User, params: ReportQuery, action: string) {
  const subject = await resolveSubject(actor, params.patientId, action);

  const conditions = ['r.user_id = $1'];
  const values: unknown[] = [subject.userId];
  if (params.from) {
    values.push(params.from);
    conditions.push(`r.measured_at >= $${values.length}`);
  }
  if (params.to) {
    values.push(params.to);
    conditions.push(`r.measured_at <= $${values.length}`);
  }

  const { rows } = await query<ReportRow>(
    `select r.id, r.session_id, r.systolic, r.diastolic, r.pulse, r.measured_at,
            array_remove(array_agg(t.id), null) as tag_ids,
            array_remove(array_agg(t.label), null) as tag_labels
     from readings r
     left join reading_tags rt on rt.reading_id = r.id
     left join tags t on t.id = rt.tag_id
     where ${conditions.join(' and ')}
     group by r.id
     order by r.measured_at`,
    values,
  );
  return collapseSessions(rows);
}

/**
 * Collapses each sitting into a single averaged reading.
 *
 * Three measurements taken a minute apart describe one moment, not three. Left
 * separate they would trible that moment's weight in every average, trend and
 * comparison - so a day you measured carefully would count for more than a day you
 * measured once, which is precisely backwards.
 *
 * The individual readings are untouched in the database and still shown in the
 * history; this is only how the reports read them.
 */
function collapseSessions(rows: readonly ReportRow[]): ReportRow[] {
  const sessions = new Map<string, ReportRow[]>();
  for (const row of rows) {
    const group = sessions.get(row.session_id) ?? [];
    group.push(row);
    sessions.set(row.session_id, group);
  }

  const collapsed = [...sessions.values()].map((group) => {
    if (group.length === 1) return group[0]!;

    const pulses = group.map((r) => r.pulse).filter((p): p is number => p !== null);
    // Tags are unioned: if any reading of the sitting was tagged "slept badly",
    // the sitting was.
    const tagIds = new Map<string, string>();
    for (const row of group) {
      (row.tag_ids ?? []).forEach((id, i) => {
        const label = row.tag_labels?.[i];
        if (label) tagIds.set(id, label);
      });
    }

    const first = group.reduce((a, b) => (a.measured_at <= b.measured_at ? a : b));
    return {
      id: first.id,
      session_id: first.session_id,
      // One decimal: an average of three whole numbers is rarely one itself, and
      // 128.7 is honest where 129 quietly invents precision in the other direction.
      systolic: round1(mean(group.map((r) => r.systolic))),
      diastolic: round1(mean(group.map((r) => r.diastolic))),
      pulse: pulses.length > 0 ? round1(mean(pulses)) : null,
      measured_at: first.measured_at,
      tag_ids: [...tagIds.keys()],
      tag_labels: [...tagIds.values()],
    } satisfies ReportRow;
  });

  return collapsed.sort((a, b) => a.measured_at.getTime() - b.measured_at.getTime());
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Local hour of a reading in the viewer's zone; falls back to UTC on a bad zone. */
function localHour(date: Date, timeZone: string): number {
  try {
    const hour = new Intl.DateTimeFormat('en-GB', {
      hour: 'numeric',
      hour12: false,
      timeZone,
    }).format(date);
    return Number.parseInt(hour, 10);
  } catch {
    return date.getUTCHours();
  }
}

function bucketFor(hour: number): TimeBucket {
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 18) return 'afternoon';
  if (hour >= 18 && hour < 22) return 'evening';
  return 'night';
}

export async function buildSummary(actor: User, params: ReportQuery): Promise<Summary> {
  const rows = await fetchReadings(actor, params, 'view_summary');

  if (rows.length === 0) {
    return {
      readingCount: 0,
      from: null,
      to: null,
      average: { systolic: 0, diastolic: 0, pulse: null },
      byTimeOfDay: [],
      categoryBreakdown: [],
      trend: null,
    };
  }

  const systolics = rows.map((r) => r.systolic);
  const diastolics = rows.map((r) => r.diastolic);
  const pulses = rows.map((r) => r.pulse).filter((p): p is number => p !== null);

  const buckets = new Map<TimeBucket, ReportRow[]>();
  for (const row of rows) {
    const bucket = bucketFor(localHour(row.measured_at, params.tz));
    const list = buckets.get(bucket) ?? [];
    list.push(row);
    buckets.set(bucket, list);
  }

  const categories = new Map<string, number>();
  for (const row of rows) {
    const label = BP_CATEGORY_LABEL[classify(row.systolic, row.diastolic)];
    categories.set(label, (categories.get(label) ?? 0) + 1);
  }

  // Trend expressed per 30 days: "-4 mmHg a month" reads better than a slope per
  // millisecond, and matches how often people actually review this.
  const firstAt = rows[0]!.measured_at.getTime();
  const dayOf = (d: Date) => (d.getTime() - firstAt) / 86_400_000;
  const spanDays = dayOf(rows[rows.length - 1]!.measured_at);

  const systolicFit = linearRegression(rows.map((r) => ({ x: dayOf(r.measured_at), y: r.systolic })));
  const diastolicFit = linearRegression(
    rows.map((r) => ({ x: dayOf(r.measured_at), y: r.diastolic })),
  );

  return {
    readingCount: rows.length,
    from: rows[0]!.measured_at.toISOString(),
    to: rows[rows.length - 1]!.measured_at.toISOString(),
    average: {
      systolic: round1(mean(systolics)),
      diastolic: round1(mean(diastolics)),
      pulse: pulses.length > 0 ? round1(mean(pulses)) : null,
    },
    byTimeOfDay: (['morning', 'afternoon', 'evening', 'night'] as const)
      .filter((bucket) => buckets.has(bucket))
      .map((bucket) => {
        const list = buckets.get(bucket)!;
        return {
          bucket,
          count: list.length,
          systolic: round1(mean(list.map((r) => r.systolic))),
          diastolic: round1(mean(list.map((r) => r.diastolic))),
        };
      }),
    categoryBreakdown: [...categories.entries()]
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count),
    trend:
      systolicFit && diastolicFit && spanDays >= 7
        ? {
            systolic: round1(systolicFit.slope * 30),
            diastolic: round1(diastolicFit.slope * 30),
            days: Math.round(spanDays),
          }
        : null,
  };
}

/** Below this, a difference is noise dressed up as a finding. */
const MIN_TAGGED_READINGS = 5;
const SIGNIFICANCE = 0.05;

/**
 * For each tag, how readings carrying it compare with readings that do not.
 *
 * This is the report the whole app is for, so it is also the one most able to
 * mislead. Two guards: nothing is reported below a usable sample size, and
 * `confident` is only true when a Welch t-test clears p < 0.05. Even then this is
 * association within one person's data - the app says "higher on days you tagged X",
 * never "X raises your blood pressure".
 *
 * One honest limitation, worth knowing before trusting a number here: each tag is
 * compared against *every* other reading, not against otherwise-similar ones. So if
 * you never do yoga on the days you sleep badly, the yoga comparison group contains
 * all those bad-sleep days and yoga will look better than it is. Untangling that
 * needs a multivariate model, which is well past what this app should carry - so the
 * report presents these as prompts for a conversation, not findings.
 */
export async function buildInsights(actor: User, params: ReportQuery): Promise<Insight[]> {
  const rows = await fetchReadings(actor, params, 'view_insights');
  if (rows.length < MIN_TAGGED_READINGS * 2) return [];

  const labelById = new Map<string, string>();
  for (const row of rows) {
    (row.tag_ids ?? []).forEach((id, index) => {
      const label = row.tag_labels?.[index];
      if (label) labelById.set(id, label);
    });
  }

  const insights: Insight[] = [];

  for (const [tagId, label] of labelById) {
    const withTag = rows.filter((r) => (r.tag_ids ?? []).includes(tagId));
    const withoutTag = rows.filter((r) => !(r.tag_ids ?? []).includes(tagId));

    if (withTag.length < MIN_TAGGED_READINGS || withoutTag.length < MIN_TAGGED_READINGS) continue;

    const systolicTest = welchTTest(
      withTag.map((r) => r.systolic),
      withoutTag.map((r) => r.systolic),
    );

    insights.push({
      tagId,
      label,
      withCount: withTag.length,
      withoutCount: withoutTag.length,
      systolicDelta: round1(
        mean(withTag.map((r) => r.systolic)) - mean(withoutTag.map((r) => r.systolic)),
      ),
      diastolicDelta: round1(
        mean(withTag.map((r) => r.diastolic)) - mean(withoutTag.map((r) => r.diastolic)),
      ),
      // toPrecision, not toFixed: a genuinely tiny p-value rounds to a flat 0 at
      // four decimal places, and "p = 0" is a claim no test can make.
      pValue: systolicTest ? Number(systolicTest.pValue.toPrecision(3)) : null,
      confident: systolicTest !== null && systolicTest.pValue < SIGNIFICANCE,
    });
  }

  // Biggest effects first, but anything statistically supported outranks a large
  // difference built on a handful of readings.
  return insights.sort((a, b) => {
    if (a.confident !== b.confident) return a.confident ? -1 : 1;
    return Math.abs(b.systolicDelta) - Math.abs(a.systolicDelta);
  });
}

/** The chart series: one point per reading, plus a daily mean for a calmer line. */
export async function buildSeries(actor: User, params: ReportQuery) {
  const rows = await fetchReadings(actor, params, 'view_series');

  const byDay = new Map<string, { systolic: number[]; diastolic: number[] }>();
  for (const row of rows) {
    const day = row.measured_at.toISOString().slice(0, 10);
    const entry = byDay.get(day) ?? { systolic: [], diastolic: [] };
    entry.systolic.push(row.systolic);
    entry.diastolic.push(row.diastolic);
    byDay.set(day, entry);
  }

  return {
    points: rows.map((r) => ({
      id: r.id,
      measuredAt: r.measured_at.toISOString(),
      systolic: r.systolic,
      diastolic: r.diastolic,
      pulse: r.pulse,
      category: classify(r.systolic, r.diastolic),
    })),
    daily: [...byDay.entries()]
      .map(([day, values]) => ({
        day,
        systolic: round1(mean(values.systolic)),
        diastolic: round1(mean(values.diastolic)),
        count: values.systolic.length,
      }))
      .sort((a, b) => a.day.localeCompare(b.day)),
  };
}
