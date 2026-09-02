import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '../src/lib/auth';
import { Loading } from '../src/components/ui';
import { colors } from '../src/lib/theme';

/**
 * Sends people to the sign-in screen when they have no session, and away from it
 * once they do. Everything else is reachable from the camera.
 */
function AuthGate() {
  const { user, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    // /verify is reached from a link in an email, by definition before there is a
    // session - so it has to be allowed through, or the gate redirects away from
    // the very screen that would create one.
    const onPublicRoute = segments[0] === 'sign-in' || segments[0] === 'verify';
    if (!user && !onPublicRoute) router.replace('/sign-in');
    else if (user && segments[0] === 'sign-in') router.replace('/');
  }, [user, loading, segments, router]);

  if (loading) return <Loading />;

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.text,
        headerTitleStyle: { fontWeight: '600' },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      {/* The camera owns the whole screen, so it carries no header. */}
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="sign-in" options={{ headerShown: false }} />
      <Stack.Screen name="verify" options={{ headerShown: false }} />
      <Stack.Screen name="confirm" options={{ title: 'Check the numbers' }} />
      <Stack.Screen name="dashboard" options={{ title: 'Your readings' }} />
      <Stack.Screen name="insights" options={{ title: 'What affects you' }} />
      <Stack.Screen name="tags" options={{ title: 'Context tags' }} />
      <Stack.Screen name="sharing" options={{ title: 'Sharing' }} />
      <Stack.Screen name="patient/[id]" options={{ title: 'Readings' }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <AuthProvider>
        <AuthGate />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
