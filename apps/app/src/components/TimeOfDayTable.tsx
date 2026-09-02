import { StyleSheet, Text, View } from 'react-native';
import { classify, type TimeBucket } from '@mp/shared';
import { Caption, Heading } from './ui';
import { categoryColors, colors, radius, spacing, type } from '../lib/theme';

export interface Bucket {
  bucket: TimeBucket;
  count: number;
  systolic: number;
  diastolic: number;
}

const LABELS: Record<TimeBucket, string> = {
  morning: 'Morning',
  afternoon: 'Afternoon',
  evening: 'Evening',
  night: 'Night',
};

const HOURS: Record<TimeBucket, string> = {
  morning: '5am – 12pm',
  afternoon: '12pm – 6pm',
  evening: '6pm – 10pm',
  night: '10pm – 5am',
};

const ORDER: TimeBucket[] = ['morning', 'afternoon', 'evening', 'night'];

/**
 * Readings split by time of day.
 *
 * This is the first thing a doctor asks about - blood pressure is genuinely
 * different in the morning, and a single daily average hides that. Kept as a table
 * rather than a chart because four rows of numbers are easier to read out loud in
 * an appointment than four bars to squint at.
 */
export function TimeOfDayTable({ buckets }: { buckets: readonly Bucket[] }) {
  const present = ORDER.map((id) => buckets.find((b) => b.bucket === id)).filter(
    (b): b is Bucket => b !== undefined,
  );
  if (present.length === 0) return null;

  return (
    <View style={styles.card}>
      <Heading>By time of day</Heading>

      <View style={[styles.row, styles.header]}>
        <Text style={[type.label, styles.when, { color: colors.textFaint }]}>WHEN</Text>
        <Text style={[type.label, styles.value, { color: colors.textFaint }]}>AVERAGE</Text>
        <Text style={[type.label, styles.count, { color: colors.textFaint }]}>N</Text>
      </View>

      {present.map((bucket) => {
        const category = classify(bucket.systolic, bucket.diastolic);
        return (
          <View key={bucket.bucket} style={styles.row}>
            <View style={styles.when}>
              <Text style={[type.body, { color: colors.text }]}>{LABELS[bucket.bucket]}</Text>
              <Caption>{HOURS[bucket.bucket]}</Caption>
            </View>
            <View style={[styles.value, styles.valueCell]}>
              {/* The dot carries the category; the number carries the meaning. */}
              <View style={[styles.dot, { backgroundColor: categoryColors[category] }]} />
              <Text style={[type.body, { color: colors.text, fontVariant: ['tabular-nums'] }]}>
                {bucket.systolic.toFixed(0)}/{bucket.diastolic.toFixed(0)}
              </Text>
            </View>
            <Text style={[type.caption, styles.count, { color: colors.textMuted }]}>
              {bucket.count}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 34 },
  header: { minHeight: 20 },
  when: { flex: 1.4, gap: 1 },
  value: { flex: 1.1 },
  valueCell: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dot: { width: 8, height: 8, borderRadius: 4 },
  count: { flex: 0.3, textAlign: 'right' },
});
