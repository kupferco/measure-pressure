import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { capturePhotoInBrowser } from '../lib/capture';
import { colors, radius, spacing } from '../lib/theme';

/**
 * The bottom navigation.
 *
 * Custom rather than react-navigation's default because two of the five things in
 * it are not tabs: taking a photo and typing a reading in are actions that lead out
 * of the tab group entirely. The camera sits in the middle, given the emphasis it
 * had on Home, because it is the reason the app exists.
 */

/**
 * The parts of react-navigation's tab bar props this bar reads.
 *
 * expo-router vendors react-navigation instead of depending on it, so
 * `BottomTabBarProps` has no public import path - only a path through
 * `expo-router/build`, which is nobody's promise. All we need is which tab is
 * showing; navigation goes through expo-router's own router by href.
 */
type TabBarProps = {
  state: { index: number; routes: readonly { key: string; name: string }[] };
};

type Item =
  | { kind: 'tab'; route: string; href: '/' | '/reports' | '/profile'; label: string; icon: IconName }
  | { kind: 'action'; label: string; icon: IconName; onPress: () => void; prominent?: boolean };

type IconName = keyof typeof Ionicons.glyphMap;

/**
 * Taking a photo, from wherever the app happens to be.
 *
 * On the web the file input must be created and clicked inside the tap that asked
 * for it, or the browser refuses to open the camera - so this is called directly
 * from onPress and nothing may be awaited before it.
 */
async function takePhoto(): Promise<void> {
  if (Platform.OS === 'web') {
    const uri = await capturePhotoInBrowser();
    if (uri) router.push({ pathname: '/confirm', params: { uri } });
    return;
  }
  router.push('/capture');
}

export function TabBar({ state }: TabBarProps) {
  const insets = useSafeAreaInsets();

  // Left to right, with the camera third of five.
  const items: Item[] = [
    { kind: 'tab', route: 'index', href: '/', label: 'Home', icon: 'pulse' },
    { kind: 'tab', route: 'reports', href: '/reports', label: 'Reports', icon: 'stats-chart' },
    { kind: 'action', label: 'Camera', icon: 'camera', onPress: takePhoto, prominent: true },
    {
      kind: 'action',
      label: 'By hand',
      icon: 'create-outline',
      onPress: () => router.push('/confirm'),
    },
    { kind: 'tab', route: 'profile', href: '/profile', label: 'Profile', icon: 'person' },
  ];

  const activeRoute = state.routes[state.index]?.name;

  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
      {items.map((item) => {
        const focused = item.kind === 'tab' && item.route === activeRoute;
        const tint = focused ? colors.accent : colors.textFaint;
        return (
          <Pressable
            key={item.label}
            onPress={() => (item.kind === 'tab' ? router.navigate(item.href) : item.onPress())}
            accessibilityRole={item.kind === 'tab' ? 'tab' : 'button'}
            accessibilityState={{ selected: focused }}
            accessibilityLabel={
              item.kind === 'action' && item.prominent
                ? 'Take a photo of your monitor'
                : item.kind === 'action'
                  ? 'Type a reading by hand'
                  : item.label
            }
            style={({ pressed }) => [styles.item, pressed && { opacity: 0.7 }]}
          >
            {item.kind === 'action' && item.prominent ? (
              <View style={styles.cameraCircle}>
                <Ionicons name={item.icon} size={26} color={colors.accentText} />
              </View>
            ) : (
              <Ionicons name={item.icon} size={24} color={tint} />
            )}
            <Text style={[styles.label, { color: focused ? colors.accent : colors.textFaint }]}>
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const CAMERA_SIZE = 46;

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingTop: spacing.sm,
    backgroundColor: colors.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  item: {
    flex: 1,
    flexBasis: 0,
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: spacing.xs,
    // Comfortably past Apple's 44pt minimum, which matters most for the two
    // outermost items sitting near the corners of the screen.
    minHeight: 48,
  },
  cameraCircle: {
    width: CAMERA_SIZE,
    height: CAMERA_SIZE,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // 11px, not the theme's 13px caption: five labels have to sit side by side on the
  // narrowest phone without any of them wrapping.
  label: { fontSize: 11, fontWeight: '600' },
});
