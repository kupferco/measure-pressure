import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import { colors, radius, seriesColors, spacing, type } from '../lib/theme';

export interface ChartPoint {
  measuredAt: string;
  systolic: number;
  diastolic: number;
}

const PADDING = { top: 16, right: 44, bottom: 26, left: 34 };
const HEIGHT = 240;

/**
 * Systolic and diastolic over time.
 *
 * One y-axis for both, which is the honest choice here: they share a unit (mmHg)
 * and the gap between the two lines is itself meaningful (pulse pressure). A second
 * axis would let the two be scaled independently and invent trends that are not there.
 *
 * Touch anywhere to read off the nearest day.
 */
export function BpChart({ points, width }: { points: ChartPoint[]; width: number }) {
  const [selected, setSelected] = useState<number | null>(null);

  const plotWidth = Math.max(width - PADDING.left - PADDING.right, 1);
  const plotHeight = HEIGHT - PADDING.top - PADDING.bottom;

  const model = useMemo(() => {
    if (points.length === 0) return null;

    const times = points.map((p) => new Date(p.measuredAt).getTime());
    const minTime = Math.min(...times);
    const maxTime = Math.max(...times);
    const timeSpan = maxTime - minTime || 1;

    const values = points.flatMap((p) => [p.systolic, p.diastolic]);
    // Always keep 80 and 120 in view: without the reference lines the chart is just
    // a wiggle with no sense of whether it is a good wiggle.
    const low = Math.min(...values, 75);
    const high = Math.max(...values, 125);
    const pad = Math.max((high - low) * 0.12, 6);
    const yMin = low - pad;
    const yMax = high + pad;

    const x = (time: number) =>
      PADDING.left + ((time - minTime) / timeSpan) * plotWidth;
    const y = (value: number) =>
      PADDING.top + plotHeight - ((value - yMin) / (yMax - yMin)) * plotHeight;

    const path = (key: 'systolic' | 'diastolic') =>
      points
        .map((p, i) => `${i === 0 ? 'M' : 'L'}${x(times[i]!).toFixed(1)},${y(p[key]).toFixed(1)}`)
        .join(' ');

    // Round gridline values rather than arbitrary fractions of the range.
    const step = yMax - yMin > 90 ? 30 : 20;
    const gridValues: number[] = [];
    for (let v = Math.ceil(yMin / step) * step; v <= yMax; v += step) gridValues.push(v);

    return { times, x, y, path, gridValues, yMin, yMax };
  }, [points, plotWidth, plotHeight]);

  if (!model || points.length === 0) {
    return (
      <View style={[styles.empty, { height: HEIGHT }]}>
        <Text style={[type.caption, { color: colors.textMuted }]}>
          Your chart appears once you have a couple of readings.
        </Text>
      </View>
    );
  }

  const { times, x, y, path, gridValues } = model;
  const active = selected !== null ? points[selected] : null;
  const last = points[points.length - 1]!;

  const handleTouch = (locationX: number) => {
    // Nearest point by horizontal distance - a fingertip is far wider than a marker,
    // so snapping beats requiring an accurate hit.
    let nearest = 0;
    let best = Infinity;
    times.forEach((time, i) => {
      const distance = Math.abs(x(time) - locationX);
      if (distance < best) {
        best = distance;
        nearest = i;
      }
    });
    setSelected(nearest);
  };

  return (
    <View>
      <Svg width={width} height={HEIGHT}>
        {gridValues.map((value) => (
          <G key={value}>
            <Line
              x1={PADDING.left}
              x2={width - PADDING.right}
              y1={y(value)}
              y2={y(value)}
              stroke={colors.border}
              strokeWidth={1}
              opacity={0.28}
            />
            <SvgText x={4} y={y(value) + 4} fill={colors.textFaint} fontSize={11}>
              {value}
            </SvgText>
          </G>
        ))}

        {/* The two thresholds a doctor actually talks about. */}
        {[120, 80].map((threshold) => (
          <Line
            key={threshold}
            x1={PADDING.left}
            x2={width - PADDING.right}
            y1={y(threshold)}
            y2={y(threshold)}
            stroke={colors.textFaint}
            strokeWidth={1}
            strokeDasharray="3 5"
            opacity={0.6}
          />
        ))}

        <Path d={path('systolic')} stroke={seriesColors.systolic} strokeWidth={2} fill="none" />
        <Path d={path('diastolic')} stroke={seriesColors.diastolic} strokeWidth={2} fill="none" />

        {/* Markers only when they will not turn the line into a caterpillar. */}
        {points.length <= 40
          ? points.map((p, i) => (
              <G key={p.measuredAt + i}>
                <Circle cx={x(times[i]!)} cy={y(p.systolic)} r={3.5} fill={seriesColors.systolic} />
                <Circle cx={x(times[i]!)} cy={y(p.diastolic)} r={3.5} fill={seriesColors.diastolic} />
              </G>
            ))
          : null}

        {/* Direct labels: identity without having to look away at a legend. */}
        <SvgText
          x={width - PADDING.right + 6}
          y={y(last.systolic) + 4}
          fill={colors.textMuted}
          fontSize={12}
          fontWeight="600"
        >
          {last.systolic}
        </SvgText>
        <SvgText
          x={width - PADDING.right + 6}
          y={y(last.diastolic) + 4}
          fill={colors.textMuted}
          fontSize={12}
          fontWeight="600"
        >
          {last.diastolic}
        </SvgText>

        {active && selected !== null ? (
          <G>
            <Line
              x1={x(times[selected]!)}
              x2={x(times[selected]!)}
              y1={PADDING.top}
              y2={PADDING.top + plotHeight}
              stroke={colors.text}
              strokeWidth={1}
              opacity={0.5}
            />
            {/* A surface-coloured ring keeps the selected marker legible over the line. */}
            <Circle cx={x(times[selected]!)} cy={y(active.systolic)} r={6} fill={seriesColors.systolic} stroke={colors.background} strokeWidth={2} />
            <Circle cx={x(times[selected]!)} cy={y(active.diastolic)} r={6} fill={seriesColors.diastolic} stroke={colors.background} strokeWidth={2} />
          </G>
        ) : null}

        <Rect
          x={PADDING.left}
          y={PADDING.top}
          width={plotWidth}
          height={plotHeight}
          fill="transparent"
          onPressIn={(event) => handleTouch(event.nativeEvent.locationX)}
        />
      </Svg>

      <View style={styles.legend}>
        <LegendItem color={seriesColors.systolic} label="Systolic" />
        <LegendItem color={seriesColors.diastolic} label="Diastolic" />
        {active ? (
          <Text style={[type.caption, { color: colors.textMuted, marginLeft: 'auto' }]}>
            {new Date(active.measuredAt).toLocaleDateString(undefined, {
              day: 'numeric',
              month: 'short',
            })}
            {'  '}
            {active.systolic}/{active.diastolic}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.swatch, { backgroundColor: color }]} />
      <Text style={[type.caption, { color: colors.textMuted }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
  },
  legend: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.sm },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  swatch: { width: 10, height: 10, borderRadius: 2 },
});
