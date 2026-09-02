interface Point {
  measuredAt: string;
  systolic: number;
  diastolic: number;
}

const PADDING = { top: 14, right: 46, bottom: 24, left: 38 };
const HEIGHT = 220;

/**
 * Systolic and diastolic over time, as plain SVG.
 *
 * One y-axis for both, deliberately: they share a unit, and the gap between the
 * lines is itself meaningful. A second axis would let the two be scaled
 * independently and invent divergences that are not in the data.
 */
export function BpChart({ points, width }: { points: Point[]; width: number }) {
  if (points.length === 0) {
    return <p className="muted">Not enough readings to chart.</p>;
  }

  const plotWidth = Math.max(width - PADDING.left - PADDING.right, 1);
  const plotHeight = HEIGHT - PADDING.top - PADDING.bottom;

  const times = points.map((p) => new Date(p.measuredAt).getTime());
  const minTime = Math.min(...times);
  const span = Math.max(Math.max(...times) - minTime, 1);

  const values = points.flatMap((p) => [p.systolic, p.diastolic]);
  // 80 and 120 stay in view whatever the data does: without the reference lines
  // the chart is a wiggle with no sense of whether it is a good wiggle.
  const low = Math.min(...values, 75);
  const high = Math.max(...values, 125);
  const pad = Math.max((high - low) * 0.12, 6);
  const yMin = low - pad;
  const yMax = high + pad;

  const x = (time: number) => PADDING.left + ((time - minTime) / span) * plotWidth;
  const y = (value: number) =>
    PADDING.top + plotHeight - ((value - yMin) / (yMax - yMin)) * plotHeight;

  const path = (key: 'systolic' | 'diastolic') =>
    points
      .map((p, i) => `${i === 0 ? 'M' : 'L'}${x(times[i]!).toFixed(1)},${y(p[key]).toFixed(1)}`)
      .join(' ');

  const step = yMax - yMin > 90 ? 30 : 20;
  const gridValues: number[] = [];
  for (let v = Math.ceil(yMin / step) * step; v <= yMax; v += step) gridValues.push(v);

  const last = points[points.length - 1]!;

  return (
    <svg width={width} height={HEIGHT} role="img" aria-label="Blood pressure over time">
      {gridValues.map((value) => (
        <g key={value}>
          <line
            x1={PADDING.left}
            x2={width - PADDING.right}
            y1={y(value)}
            y2={y(value)}
            stroke="var(--border)"
          />
          <text x={4} y={y(value) + 4} fontSize={11} fill="var(--text-faint)">
            {value}
          </text>
        </g>
      ))}

      {/* The two thresholds a doctor actually talks about. */}
      {[120, 80].map((threshold) => (
        <line
          key={threshold}
          x1={PADDING.left}
          x2={width - PADDING.right}
          y1={y(threshold)}
          y2={y(threshold)}
          stroke="var(--border-strong)"
          strokeDasharray="3 5"
        />
      ))}

      <path d={path('systolic')} stroke="var(--series-systolic)" strokeWidth={2} fill="none" />
      <path d={path('diastolic')} stroke="var(--series-diastolic)" strokeWidth={2} fill="none" />

      {points.length <= 60
        ? points.map((p, i) => (
            <g key={p.measuredAt + i}>
              <circle cx={x(times[i]!)} cy={y(p.systolic)} r={2.5} fill="var(--series-systolic)" />
              <circle cx={x(times[i]!)} cy={y(p.diastolic)} r={2.5} fill="var(--series-diastolic)" />
            </g>
          ))
        : null}

      {/* Direct labels: identity without looking away at a legend. */}
      <text x={width - PADDING.right + 6} y={y(last.systolic) + 4} fontSize={12} fontWeight={600} fill="var(--text-muted)">
        {Math.round(last.systolic)}
      </text>
      <text x={width - PADDING.right + 6} y={y(last.diastolic) + 4} fontSize={12} fontWeight={600} fill="var(--text-muted)">
        {Math.round(last.diastolic)}
      </text>
    </svg>
  );
}
