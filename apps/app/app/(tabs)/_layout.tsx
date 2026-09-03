import { Tabs } from 'expo-router';
import { TabBar } from '../../src/components/TabBar';
import { colors } from '../../src/lib/theme';

/**
 * Three tabs, the same for everyone. Reading other people's readings is a
 * different job on a different device, and lives in the separate clinician app -
 * see apps/doctor.
 *
 * The bar itself is ours: it carries two actions alongside the tabs, which the
 * default cannot express. See src/components/TabBar.
 */
export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.text,
        headerShadowVisible: false,
        headerTitleStyle: { fontWeight: '600' },
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home', headerShown: false }} />
      <Tabs.Screen name="reports" options={{ title: 'Reports' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
    </Tabs>
  );
}
