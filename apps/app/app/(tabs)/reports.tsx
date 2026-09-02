import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Reading, Summary } from '@mp/shared';
import { BP_CATEGORY_LABEL, classify } from '@mp/shared';
import { RangeTabs } from '../../src/components/RangeTabs';
import { TimeOfDayTable } from '../../src/components/TimeOfDayTable';
import {
  Body,
  Caption,
  Card,
  EmptyState,
  ErrorNote,
  Heading,
  Label,
  Loading,
} from '../../src/components/ui';
import { api } from '../../src/lib/api';
import { DEFAULT_RANGE, describeWindow, rangeDays, type RangeId } from '../../src/lib/ranges';
import { categoryColors, colors, radius, spacing, type } from '../../src/lib/theme';

const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC';

/**
 * The detail behind the chart on Home: the split by time of day, what the readings
 * add up to, and the log itself.
 */
export default function ReportsScreen() {
  const router = useRouter();

  const [range, setRange] = useState<RangeId>(DEFAULT_RANGE);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [readings, setReadings] = useState<Reading[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (id: RangeId) => {
    const from = new Date(Date.now() - rangeDays(id) * 86_400_000).toISOString();
    try {
      const [summaryResult, readingsResult] = await Promise.all([
        api.summary(timeZone, undefined, from),
        api.listReadings({ from, limit: 200 }),
      ]);
      setSummary(summaryResult.summary);
      setReadings(readingsResult.readings);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load your reports.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load(range);
  }, [load, range]);

  if (loading) return <Loading />;

  const sittings = groupIntoSittings(readings);

  return (
    <SafeAreaView style={styles.screen} edges={[]}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load(range);
            }}
            tintColor={colors.textMuted}
          />
        }
      >
        <ErrorNote message={error} />
        <RangeTabs value={range} onChange={setRange} />
        <Caption>{describeWindow(range)}</Caption>

        {!summary || summary.readingCount === 0 ? (
          <EmptyState title="Nothing in this period" body="Try a longer one, or add a reading." />
        ) : (
          <>
            <View style={styles.statRow}>
              <Stat
                label="Average"
                value={`${summary.average.systolic.toFixed(0)}/${summary.average.diastolic.toFixed(0)}`}
              />
              <Stat label="Sittings" value={String(summary.readingCount)} />
              {summary.trend ? (
                <Stat
                  label="Per month"
                  value={`${summary.trend.systolic > 0 ? '+' : ''}${summary.trend.systolic.toFixed(1)}`}
                  hint={summary.trend.systolic < 0 ? 'falling' : 'rising'}
                />
              ) : null}
            </View>

            <TimeOfDayTable buckets={summary.byTimeOfDay} />

            <Card>
              <Heading>How the readings fall</Heading>
              {summary.categoryBreakdown.map((entry) => (
                <View key={entry.category} style={styles.row}>
                  <Body>{entry.category}</Body>
                  <Caption>{entry.count}</Caption>
                </View>
              ))}
            </Card>

            <Pressable onPress={() => router.push('/insights')}>
              <Card>
                <Heading>What affects your readings →</Heading>
                <Caption>
                  Compares readings you tagged against the rest, so you can see what actually moves
                  the numbers.
                </Caption>
              </Card>
            </Pressable>

            <View style={{ gap: spacing.sm }}>
              <Label>Log</Label>
              {sittings.map((sitting) => (
                <SittingRow key={sitting.id} readings={sitting.readings} />
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

interface Sitting {
  id: string;
  readings: Reading[];
}

/** Collapses readings sharing a session into one entry, keeping the originals. */
function groupIntoSittings(readings: Reading[]): Sitting[] {
  const groups = new Map<string, Reading[]>();
  for (const reading of readings) {
    const group = groups.get(reading.sessionId) ?? [];
    group.push(reading);
    groups.set(reading.sessionId, group);
  }
  return [...groups.values()].map((group) => ({ id: group[0]!.id, readings: group }));
}

const format = (value: number) => (Number.isInteger(value) ? String(value) : value.toFixed(1));

export function SittingRow({ readings }: { readings: Reading[] }) {
  const average = (key: 'systolic' | 'diastolic') =>
    readings.reduce((sum, r) => sum + r[key], 0) / readings.length;
  const systolic = average('systolic');
  const diastolic = average('diastolic');
  const pulses = readings.map((r) => r.pulse).filter((p): p is number => p != null);

  const notes = readings.map((r) => r.note).filter(Boolean);
  const tags = [...new Map(readings.flatMap((r) => r.tags).map((t) => [t.id, t])).values()];

  return (
    <View style={styles.readingRow}>
      <View
        style={[styles.readingBar, { backgroundColor: categoryColors[classify(systolic, diastolic)] }]}
      />
      <View style={{ flex: 1, gap: 2 }}>
        <Body>
          {format(systolic)}/{format(diastolic)}
          {pulses.length > 0
            ? `  ·  ${format(pulses.reduce((a, b) => a + b, 0) / pulses.length)} bpm`
            : ''}
        </Body>
        <Caption>
          {formatWhen(readings[readings.length - 1]!.measuredAt)}
          {readings.length > 1 ? `  ·  average of ${readings.length}` : ''}
        </Caption>
        {/* The individual measurements, so an outlier is never hidden by its average. */}
        {readings.length > 1 ? (
          <Caption style={{ color: colors.textFaint }}>
            {[...readings].reverse().map((r) => `${r.systolic}/${r.diastolic}`).join('   ')}
          </Caption>
        ) : null}
        {notes.length > 0 ? <Caption style={{ fontStyle: 'italic' }}>{notes.join(' · ')}</Caption> : null}
        {tags.length > 0 ? <Caption>{tags.map((t) => t.label).join(' · ')}</Caption> : null}
      </View>
    </View>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <View style={styles.stat}>
      <Label>{label}</Label>
      <Text style={[type.heading, { color: colors.text }]}>{value}</Text>
      {hint ? <Caption>{hint}</Caption> : null}
    </View>
  );
}

export function formatWhen(iso: string): string {
  const date = new Date(iso);
  const daysAgo = Math.floor((Date.now() - date.getTime()) / 86_400_000);
  const time = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  if (daysAgo === 0) return `Today, ${time}`;
  if (daysAgo === 1) return `Yesterday, ${time}`;
  return `${date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}, ${time}`;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.md, maxWidth: 720, width: '100%', alignSelf: 'center' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  statRow: { flexDirection: 'row', gap: spacing.sm },
  stat: { flex: 1, backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, gap: 2 },
  readingRow: {
    flexDirection: 'row',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  readingBar: { width: 4, borderRadius: 2 },
});
