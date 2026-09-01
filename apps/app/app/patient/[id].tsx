import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import type { Insight, Reading, Summary } from '@mp/shared';
import { BP_CATEGORY_LABEL, classify } from '@mp/shared';
import { BpChart, type ChartPoint } from '../../src/components/BpChart';
import { Body, Caption, Card, EmptyState, ErrorNote, Heading, Label, Loading, Screen } from '../../src/components/ui';
import { api } from '../../src/lib/api';
import { categoryColors, colors, radius, spacing, type } from '../../src/lib/theme';

const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC';

/**
 * A patient's history, as their doctor sees it.
 *
 * Read-only by construction: there is no write path here, and the API refuses one
 * anyway. Every visit to this screen is recorded in the access log.
 */
export default function PatientScreen() {
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const router = useRouter();
  const { width } = useWindowDimensions();

  const [summary, setSummary] = useState<Summary | null>(null);
  const [points, setPoints] = useState<ChartPoint[]>([]);
  const [readings, setReadings] = useState<Reading[]>([]);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    Promise.all([
      api.summary(timeZone, id),
      api.series(timeZone, id),
      api.listReadings({ patientId: id, limit: 30 }),
      api.insights(id),
    ])
      .then(([summaryResult, seriesResult, readingsResult, insightsResult]) => {
        setSummary(summaryResult.summary);
        setPoints(seriesResult.points);
        setReadings(readingsResult.readings);
        setInsights(insightsResult.insights);
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : 'Could not load these readings.'),
      )
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <Loading />;
  if (error) return <Screen><ErrorNote message={error} /></Screen>;

  if (!summary || summary.readingCount === 0) {
    return (
      <Screen>
        <EmptyState title={name ?? 'No readings'} body="This person has not recorded any readings yet." />
      </Screen>
    );
  }

  const chartWidth = Math.min(width, 720) - spacing.lg * 2;
  const confident = insights.filter((i) => i.confident);

  return (
    <Screen>
      <View style={{ gap: spacing.xs }}>
        <Heading>{name ?? 'Patient'}</Heading>
        <Caption>
          {summary.readingCount} readings · average {summary.average.systolic.toFixed(0)}/
          {summary.average.diastolic.toFixed(0)} mmHg
        </Caption>
      </View>

      <BpChart points={points} width={chartWidth} />

      {summary.trend ? (
        <Card>
          <Heading>Trend</Heading>
          <Body muted>
            Systolic {summary.trend.systolic > 0 ? 'rising' : 'falling'} by{' '}
            {Math.abs(summary.trend.systolic).toFixed(1)} mmHg per month across{' '}
            {summary.trend.days} days.
          </Body>
        </Card>
      ) : null}

      {summary.byTimeOfDay.length > 1 ? (
        <Card>
          <Heading>Time of day</Heading>
          {summary.byTimeOfDay.map((bucket) => (
            <View key={bucket.bucket} style={styles.row}>
              <Body>{bucket.bucket.charAt(0).toUpperCase() + bucket.bucket.slice(1)}</Body>
              <Caption>
                {bucket.systolic.toFixed(0)}/{bucket.diastolic.toFixed(0)} · {bucket.count}
              </Caption>
            </View>
          ))}
        </Card>
      ) : null}

      {confident.length > 0 ? (
        <Card>
          <Heading>Patterns worth asking about</Heading>
          {confident.map((insight) => (
            <View key={insight.tagId} style={styles.row}>
              <Body>{insight.label}</Body>
              <Caption>
                {insight.systolicDelta > 0 ? '+' : ''}
                {insight.systolicDelta.toFixed(1)} mmHg · n={insight.withCount}
              </Caption>
            </View>
          ))}
          <Caption>
            Association within this person's own readings, unadjusted for overlapping habits.
          </Caption>
        </Card>
      ) : null}

      <View style={{ gap: spacing.sm }}>
        <Label>Readings</Label>
        {readings.map((reading) => {
          const category = classify(reading.systolic, reading.diastolic);
          return (
            <View key={reading.id} style={styles.readingRow}>
              <View style={[styles.readingBar, { backgroundColor: categoryColors[category] }]} />
              <View style={{ flex: 1, gap: 2 }}>
                <Body>
                  {reading.systolic}/{reading.diastolic}
                  {reading.pulse ? `  ·  ${reading.pulse} bpm` : ''}
                </Body>
                <Caption>
                  {new Date(reading.measuredAt).toLocaleString(undefined, {
                    day: 'numeric',
                    month: 'short',
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                  {'  ·  '}
                  {BP_CATEGORY_LABEL[category]}
                </Caption>
                {reading.note ? <Caption style={{ fontStyle: 'italic' }}>{reading.note}</Caption> : null}
                {reading.tags.length > 0 ? (
                  <Caption>{reading.tags.map((t) => t.label).join(' · ')}</Caption>
                ) : null}
              </View>
            </View>
          );
        })}
      </View>

      <Text
        style={[type.caption, { color: colors.textFaint }]}
        onPress={() => router.back()}
        accessibilityRole="button"
      >
        ← Back
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.md },
  readingRow: {
    flexDirection: 'row',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  readingBar: { width: 4, borderRadius: 2 },
});
