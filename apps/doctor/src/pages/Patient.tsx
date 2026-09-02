import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { Insight, Reading, Summary } from '@mp/shared';
import {
  BP_CATEGORY_LABEL,
  DEFAULT_RANGE,
  describeWindow,
  RANGES,
  rangeDays,
  type RangeId,
} from '@mp/shared';
import { api } from '../api';
import { BpChart } from '../components/BpChart';
import { DiaryTable } from '../components/DiaryTable';
import { buildDiary } from '../lib/diary';

const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC';

/**
 * One patient's record, laid out for the two minutes of an appointment: the
 * headline numbers, the trend, and then the diary itself.
 */
export function PatientPage() {
  const { id } = useParams<{ id: string }>();
  const [range, setRange] = useState<RangeId>(DEFAULT_RANGE);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [readings, setReadings] = useState<Reading[]>([]);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chartWidth, setChartWidth] = useState(880);
  const chartBox = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const measure = () => setChartWidth(chartBox.current?.clientWidth ?? 880);
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [loading]);

  const load = useCallback(async (patientId: string, id: RangeId) => {
    const from = new Date(Date.now() - rangeDays(id) * 86_400_000).toISOString();
    try {
      const [summaryResult, readingsResult, insightsResult] = await Promise.all([
        api.summary(patientId, from),
        api.readings(patientId, from),
        api.insights(patientId),
      ]);
      setSummary(summaryResult.summary);
      setReadings(readingsResult.readings);
      setInsights(insightsResult.insights);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load these readings.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (id) load(id, range);
  }, [id, range, load]);

  if (loading) return <div className="page"><p className="muted">Loading…</p></div>;
  if (error) return <div className="page"><div className="error">{error}</div></div>;

  const diary = buildDiary(readings, timeZone);
  // The chart reads the diary rather than the raw list, so a sitting of three
  // counts once - otherwise a carefully measured day outweighs a lazy one.
  const points = diary
    .flatMap((row) =>
      Object.values(row.slots).map((cell) => ({
        measuredAt: `${row.day}T12:00:00Z`,
        systolic: cell.systolic,
        diastolic: cell.diastolic,
      })),
    )
    .sort((a, b) => a.measuredAt.localeCompare(b.measuredAt));

  const confident = insights.filter((i) => i.confident);

  return (
    <div className="page stack">
      <div className="spread no-print">
        <Link to="/" className="small">← All patients</Link>
        <button className="secondary" onClick={() => window.print()}>Print</button>
      </div>

      <div className="spread">
        <h1>{readings[0] ? 'Readings' : 'Readings'}</h1>
        <div className="segmented no-print" role="group" aria-label="Time range">
          {RANGES.map((option) => (
            <button
              key={option.id}
              aria-pressed={option.id === range}
              onClick={() => setRange(option.id)}
              title={option.spoken}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
      <p className="small muted">{describeWindow(range)} · times shown in {timeZone}</p>

      {!summary || summary.readingCount === 0 ? (
        <div className="card">
          <p className="muted">No readings in this period.</p>
        </div>
      ) : (
        <>
          <div className="row" style={{ gap: 24, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div>
              <p className="small faint">AVERAGE</p>
              <p className="tabular" style={{ fontSize: 34, fontWeight: 700, lineHeight: 1.1 }}>
                {summary.average.systolic.toFixed(0)}/{summary.average.diastolic.toFixed(0)}
              </p>
            </div>
            <div>
              <p className="small faint">SITTINGS</p>
              <p style={{ fontSize: 20, fontWeight: 600 }}>{summary.readingCount}</p>
            </div>
            {summary.trend ? (
              <div>
                <p className="small faint">PER MONTH</p>
                <p style={{ fontSize: 20, fontWeight: 600 }}>
                  {summary.trend.systolic > 0 ? '+' : ''}
                  {summary.trend.systolic.toFixed(1)}{' '}
                  <span className="small muted">
                    {summary.trend.systolic < 0 ? 'falling' : 'rising'}
                  </span>
                </p>
              </div>
            ) : null}
          </div>

          <div className="card" ref={chartBox}>
            <BpChart points={points} width={chartWidth - 38} />
            <div className="legend" style={{ marginTop: 10 }}>
              <span className="item">
                <span className="dot" style={{ background: 'var(--series-systolic)' }} /> Systolic
              </span>
              <span className="item">
                <span className="dot" style={{ background: 'var(--series-diastolic)' }} /> Diastolic
              </span>
            </div>
          </div>

          <div className="card">
            <h2 style={{ marginBottom: 12 }}>Diary</h2>
            <DiaryTable rows={diary} />
            <div className="legend" style={{ marginTop: 14 }}>
              {(['normal', 'elevated', 'hypertension_1', 'hypertension_2', 'crisis'] as const).map(
                (category) => (
                  <span className="item" key={category}>
                    <span className={`dot cat-${category}`} /> {BP_CATEGORY_LABEL[category]}
                  </span>
                ),
              )}
            </div>
            <p className="small faint" style={{ marginTop: 10 }}>
              Each cell averages the measurements taken in that part of the day; ×n says how many.
              Categories follow ACC/AHA thresholds.
            </p>
          </div>

          {confident.length > 0 ? (
            <div className="card">
              <h2 style={{ marginBottom: 8 }}>Patterns worth asking about</h2>
              <table className="diary">
                <tbody>
                  {confident.map((insight) => (
                    <tr key={insight.tagId}>
                      <th scope="row">{insight.label}</th>
                      <td className="tabular">
                        {insight.systolicDelta > 0 ? '+' : ''}
                        {insight.systolicDelta.toFixed(1)} mmHg systolic
                      </td>
                      <td className="small muted">
                        n={insight.withCount} vs {insight.withoutCount}
                        {insight.pValue !== null
                          ? insight.pValue < 0.001
                            ? ' · p < 0.001'
                            : ` · p = ${insight.pValue}`
                          : ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="small faint" style={{ marginTop: 10 }}>
                Association within this person's own readings, compared against all their other
                readings and unadjusted for overlapping habits. A prompt for a conversation, not a
                finding.
              </p>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
