import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Reading, Summary } from '@mp/shared';
import { BP_CATEGORY_LABEL, classify } from '@mp/shared';
import { BpChart, type ChartPoint } from '../src/components/BpChart';
import { Body, Button, Caption, Card, EmptyState, ErrorNote, Heading, Label, Loading } from '../src/components/ui';
import { api } from '../src/lib/api';
import { useAuth } from '../src/lib/auth';
import { categoryColors, colors, radius, spacing, type } from '../src/lib/theme';

const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC';

export default function DashboardScreen() {
  const router = useRouter();
  const { signOut } = useAuth();
  const { width } = useWindowDimensions();

  const [summary, setSummary] = useState<Summary | null>(null);
  const [points, setPoints] = useState<ChartPoint[]>([]);
  const [readings, setReadings] = useState<Reading[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [summaryResult, seriesResult, readingsResult] = await Promise.all([
        api.summary(timeZone),
        api.series(timeZone),
        api.listReadings({ limit: 20 }),
      ]);
      setSummary(summaryResult.summary);
      setPoints(seriesResult.points);
      setReadings(readingsResult.readings);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load your readings.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <Loading />;

  const latest = readings[0];
  const chartWidth = Math.min(width, 720) - spacing.lg * 2;

  return (
    <SafeAreaView style={styles.screen} edges={['bottom']}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load();
            }}
            tintColor={colors.textMuted}
          />
        }
      >
        <ErrorNote message={error} />

        {!latest ? (
          <EmptyState
            title="Nothing recorded yet"
            body="Take a photo of your monitor and the numbers land here. The charts fill in as you go."
          />
        ) : (
          <>
            {/* The hero: the number you came to see, and what it means in words. */}
            <View style={styles.hero}>
              <Label>Latest reading</Label>
              <View style={styles.heroRow}>
                <Text style={styles.heroNumbers}>
                  {latest.systolic}
                  <Text style={styles.heroSlash}>/</Text>
                  {latest.diastolic}
                </Text>
                <View style={{ gap: 2 }}>
                  <Text style={[type.caption, { color: colors.textMuted }]}>mmHg</Text>
                  {latest.pulse ? (
                    <Text style={[type.caption, { color: colors.textMuted }]}>
                      {latest.pulse} bpm
                    </Text>
                  ) : null}
                </View>
              </View>
              <CategoryBadge systolic={latest.systolic} diastolic={latest.diastolic} />
              <Caption>{formatWhen(latest.measuredAt)}</Caption>
            </View>

            <BpChart points={points} width={chartWidth} />

            {summary && summary.readingCount > 0 ? (
              <View style={styles.statRow}>
                <Stat label="Average" value={`${summary.average.systolic.toFixed(0)}/${summary.average.diastolic.toFixed(0)}`} />
                <Stat label="Readings" value={String(summary.readingCount)} />
                {summary.trend ? (
                  <Stat
                    label="Per month"
                    value={`${summary.trend.systolic > 0 ? '+' : ''}${summary.trend.systolic.toFixed(1)}`}
                    hint={summary.trend.systolic < 0 ? 'falling' : 'rising'}
                  />
                ) : null}
              </View>
            ) : null}

            {summary && summary.byTimeOfDay.length > 1 ? (
              <Card>
                <Heading>Time of day</Heading>
                {summary.byTimeOfDay.map((bucket) => (
                  <View key={bucket.bucket} style={styles.bucketRow}>
                    <Body>{capitalise(bucket.bucket)}</Body>
                    <Caption>
                      {bucket.systolic.toFixed(0)}/{bucket.diastolic.toFixed(0)} · {bucket.count}
                    </Caption>
                  </View>
                ))}
              </Card>
            ) : null}

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
              <Label>Recent</Label>
              {readings.slice(0, 10).map((reading) => (
                <View key={reading.id} style={styles.readingRow}>
                  <View
                    style={[
                      styles.readingBar,
                      { backgroundColor: categoryColors[classify(reading.systolic, reading.diastolic)] },
                    ]}
                  />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Body>
                      {reading.systolic}/{reading.diastolic}
                      {reading.pulse ? `  ·  ${reading.pulse} bpm` : ''}
                    </Body>
                    <Caption>{formatWhen(reading.measuredAt)}</Caption>
                    {reading.note ? <Caption style={{ fontStyle: 'italic' }}>{reading.note}</Caption> : null}
                    {reading.tags.length > 0 ? (
                      <Caption>{reading.tags.map((t) => t.label).join(' · ')}</Caption>
                    ) : null}
                  </View>
                </View>
              ))}
            </View>
          </>
        )}

        <View style={{ gap: spacing.sm, marginTop: spacing.lg }}>
          <Button label="Take a reading" onPress={() => router.replace('/')} />
          <Button label="Share with your doctor" variant="secondary" onPress={() => router.push('/sharing')} />
          <Button label="Edit tags" variant="ghost" onPress={() => router.push('/tags')} />
          <Button label="Sign out" variant="danger" onPress={signOut} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function CategoryBadge({ systolic, diastolic }: { systolic: number; diastolic: number }) {
  const category = classify(systolic, diastolic);
  return (
    <View style={styles.badge}>
      <View style={[styles.badgeDot, { backgroundColor: categoryColors[category] }]} />
      {/* The written label is not decoration: it is what makes the colour readable
          to someone who cannot distinguish these hues. */}
      <Text style={[type.caption, { color: colors.text }]}>{BP_CATEGORY_LABEL[category]}</Text>
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

function capitalise(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatWhen(iso: string): string {
  const date = new Date(iso);
  const daysAgo = Math.floor((Date.now() - date.getTime()) / 86_400_000);
  const time = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  if (daysAgo === 0) return `Today, ${time}`;
  if (daysAgo === 1) return `Yesterday, ${time}`;
  return `${date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}, ${time}`;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.lg, maxWidth: 720, width: '100%', alignSelf: 'center' },

  hero: { gap: spacing.sm },
  heroRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  heroNumbers: { fontSize: 56, fontWeight: '700', color: colors.text, letterSpacing: -1.5 },
  heroSlash: { fontSize: 40, color: colors.textFaint, fontWeight: '400' },

  badge: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  badgeDot: { width: 10, height: 10, borderRadius: 5 },

  statRow: { flexDirection: 'row', gap: spacing.sm },
  stat: { flex: 1, backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, gap: 2 },

  bucketRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },

  readingRow: {
    flexDirection: 'row',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  readingBar: { width: 4, borderRadius: 2 },
});
