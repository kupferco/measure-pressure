import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import type { Insight, Reading, Summary } from '@mp/shared';
import { BpChart, type ChartPoint } from '../../src/components/BpChart';
import { RangeTabs } from '../../src/components/RangeTabs';
import { TimeOfDayTable } from '../../src/components/TimeOfDayTable';
import { Body, Caption, Card, EmptyState, ErrorNote, Heading, Label, Loading } from '../../src/components/ui';
import { api } from '../../src/lib/api';
import { DEFAULT_RANGE, describeWindow, rangeDays, withinRange, type RangeId } from '../../src/lib/ranges';
import { colors, radius, spacing, type } from '../../src/lib/theme';
import { SittingRow } from '../(tabs)/reports';

const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC';

/**
 * A patient's history, as their doctor sees it.
 *
 * Read-only by construction: there is no write path here, and the API refuses one
 * anyway. Every visit to this screen is recorded in the access log.
 *
 * Laid out for the two minutes of an appointment: the trend, then the split by
 * time of day, which is what gets asked about.
 */
export default function PatientScreen() {
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const { width } = useWindowDimensions();

  const [range, setRange] = useState<RangeId>(DEFAULT_RANGE);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [points, setPoints] = useState<ChartPoint[]>([]);
  const [readings, setReadings] = useState<Reading[]>([]);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (patientId: string, id: RangeId) => {
      const from = new Date(Date.now() - rangeDays(id) * 86_400_000).toISOString();
      try {
        const [summaryResult, seriesResult, readingsResult, insightsResult] = await Promise.all([
          api.summary(timeZone, patientId, from),
          api.series(timeZone, patientId),
          api.listReadings({ patientId, from, limit: 200 }),
          api.insights(patientId),
        ]);
        setSummary(summaryResult.summary);
        setPoints(seriesResult.points);
        setReadings(readingsResult.readings);
        setInsights(insightsResult.insights);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not load these readings.');
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (id) load(id, range);
  }, [id, range, load]);

  if (loading) return <Loading />;
  if (error) {
    return (
      <ScrollView contentContainerStyle={styles.content}>
        <ErrorNote message={error} />
      </ScrollView>
    );
  }

  const visible = withinRange(points, range);
  const chartWidth = Math.min(width, 720) - spacing.lg * 2;
  const confident = insights.filter((i) => i.confident);
  const sittings = groupIntoSittings(readings);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={{ gap: spacing.xs }}>
        <Heading>{name ?? 'Patient'}</Heading>
        <Caption>Read-only. They can see that you opened this.</Caption>
      </View>

      <RangeTabs value={range} onChange={setRange} />

      {!summary || summary.readingCount === 0 ? (
        <EmptyState title="Nothing in this period" body="No readings were recorded in this window." />
      ) : (
        <>
          <View style={styles.headline}>
            <Text style={styles.average}>
              {summary.average.systolic.toFixed(0)}
              <Text style={styles.slash}>/</Text>
              {summary.average.diastolic.toFixed(0)}
            </Text>
            <View style={{ gap: 2 }}>
              <Caption>average mmHg</Caption>
              <Caption>
                {summary.readingCount} {summary.readingCount === 1 ? 'sitting' : 'sittings'}
              </Caption>
            </View>
          </View>

          <BpChart points={visible} width={chartWidth} />
          <Caption style={{ textAlign: 'center' }}>{describeWindow(range)}</Caption>

          <TimeOfDayTable buckets={summary.byTimeOfDay} />

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
            <Label>Log</Label>
            {sittings.map((group) => (
              <SittingRow key={group[0]!.id} readings={group} />
            ))}
          </View>
        </>
      )}
    </ScrollView>
  );
}

function groupIntoSittings(readings: Reading[]): Reading[][] {
  const groups = new Map<string, Reading[]>();
  for (const reading of readings) {
    const group = groups.get(reading.sessionId) ?? [];
    group.push(reading);
    groups.set(reading.sessionId, group);
  }
  return [...groups.values()];
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.md, maxWidth: 720, width: '100%', alignSelf: 'center' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.md },
  headline: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  average: { fontSize: 46, fontWeight: '700', color: colors.text, letterSpacing: -1.5 },
  slash: { fontSize: 32, color: colors.textFaint, fontWeight: '400' },
});
