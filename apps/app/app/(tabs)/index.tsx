import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
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
import { capturePhotoInBrowser } from '../../src/lib/capture';
import { DEFAULT_RANGE, describeWindow, withinRange, type RangeId } from '../../src/lib/ranges';
import { colors, radius, spacing, type } from '../../src/lib/theme';

const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC';

/**
 * Home.
 *
 * Two things and nothing else: how the readings are going, and the button that
 * adds another. Everything else is a tab away.
 */
export default function HomeScreen() {
  const router = useRouter();
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

  const capture = async () => {
    if (Platform.OS === 'web') {
      // A file input has to be opened by a real tap, so this is as direct as the
      // browser allows: one press, straight to the camera, no screen in between.
      const uri = await capturePhotoInBrowser();
      if (uri) router.push({ pathname: '/confirm', params: { uri } });
      return;
    }
    router.push('/capture');
  };

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
                ? 'Take a photo of your monitor and the numbers land here.'
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

      {/* The reason the app exists, given the space that implies. */}
      <View style={styles.actionBar}>
        <Pressable
          onPress={capture}
          accessibilityRole="button"
          accessibilityLabel="Open the camera to take a reading"
          style={({ pressed }) => [styles.capture, pressed && { opacity: 0.85 }]}
        >
          <Text style={styles.captureLabel}>Open camera</Text>
        </Pressable>
        <Pressable
          onPress={() => router.push('/confirm')}
          accessibilityRole="button"
          accessibilityLabel="Type a reading by hand"
          hitSlop={8}
        >
          <Text style={[type.caption, { color: colors.textMuted }]}>Type it instead</Text>
        </Pressable>
      </View>
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

  actionBar: {
    padding: spacing.lg,
    paddingTop: spacing.sm,
    gap: spacing.sm,
    alignItems: 'center',
    maxWidth: 720,
    width: '100%',
    alignSelf: 'center',
  },
  capture: {
    width: '100%',
    minHeight: 62,
    borderRadius: radius.lg,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  captureLabel: { fontSize: 19, fontWeight: '700', color: colors.accentText },
});
