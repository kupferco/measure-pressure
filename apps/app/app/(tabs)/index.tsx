import { DEFAULT_RANGE, describeWindow, rangeDays, withinRange, type RangeId } from '@mp/shared';
import { useCallback, useEffect, useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BpChart, type ChartPoint } from '../../src/components/BpChart';
import { RangeTabs } from '../../src/components/RangeTabs';
import { Caption, EmptyState, ErrorNote, Loading } from '../../src/components/ui';
import { api } from '../../src/lib/api';
import { useAuth } from '../../src/lib/auth';
import { colors, spacing } from '../../src/lib/theme';

const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC';

/**
 * Home.
 *
 * How the readings are going, and nothing else. Adding one is the camera in the
 * middle of the tab bar, which is reachable from every screen rather than only
 * from here.
 */
export default function HomeScreen() {
  const { width } = useWindowDimensions();
  const { user } = useAuth();

  const [points, setPoints] = useState<ChartPoint[]>([]);
  const [range, setRange] = useState<RangeId>(DEFAULT_RANGE);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const { points } = await api.series(timeZone);
      setPoints(points);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load your readings.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    // Waiting for the session avoids a guaranteed 401 on first paint, while the
    // gate is still deciding whether to send this person to sign in.
    if (user) load();
  }, [load, user]);

  if (loading) return <Loading />;

  const visible = withinRange(points, range);
  const chartWidth = Math.min(width, 720) - spacing.lg * 2;

  const average = (key: 'systolic' | 'diastolic') =>
    visible.reduce((sum, p) => sum + p[key], 0) / visible.length;

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
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

        <RangeTabs value={range} onChange={setRange} />

        {visible.length === 0 ? (
          <EmptyState
            title="Nothing here yet"
            body={
              points.length === 0
                ? 'Tap the camera below, photograph your monitor, and the numbers land here.'
                : 'No readings in this period. Try a longer one.'
            }
          />
        ) : (
          <>
            <View style={styles.headline}>
              <Text style={styles.average}>
                {average('systolic').toFixed(0)}
                <Text style={styles.slash}>/</Text>
                {average('diastolic').toFixed(0)}
              </Text>
              <View style={{ gap: 2 }}>
                <Caption>average mmHg</Caption>
                <Caption>
                  {visible.length} {visible.length === 1 ? 'sitting' : 'sittings'}
                </Caption>
              </View>
            </View>

            <BpChart points={visible} width={chartWidth} />
            <Caption style={{ textAlign: 'center' }}>{describeWindow(range)}</Caption>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: {
    padding: spacing.lg,
    gap: spacing.md,
    maxWidth: 720,
    width: '100%',
    alignSelf: 'center',
    flexGrow: 1,
  },

  headline: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  average: { fontSize: 52, fontWeight: '700', color: colors.text, letterSpacing: -1.5 },
  slash: { fontSize: 36, color: colors.textFaint, fontWeight: '400' },
});
