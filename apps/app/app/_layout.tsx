import { Stack, useRouter, useSegments } from 'expo-router';
import { Platform } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '../src/lib/auth';
import { Loading } from '../src/components/ui';
import { colors } from '../src/lib/theme';

/**
 * Sends people to the sign-in screen when they have no session, and away from it
 * once they do. Everything else is reachable from the camera.
 */
function AuthGate() {
  const { user, loading, patientCount, readingCount, pendingInvitations } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  // The start-screen preference applies once per launch. Without this it would
  // fire again on every navigation and make the app impossible to move around in.
  const appliedStartScreen = useRef(false);

  useEffect(() => {
    if (loading) return;
    // /verify is reached from a link in an email, by definition before there is a
    // session - so it has to be allowed through, or the gate redirects away from
    // the very screen that would create one.
    const onPublicRoute = segments[0] === 'sign-in' || segments[0] === 'verify';
    if (!user && !onPublicRoute) {
      router.replace('/sign-in');
      return;
    }
    if (!user) return;

    const justSignedIn = segments[0] === 'sign-in';
    // The start-screen choice applies once per launch, and again the moment someone
    // signs in. Without the guard it would re-fire on every navigation and make the
    // app impossible to move around in.
    if (!justSignedIn && appliedStartScreen.current) return;

    // Inside the tab group the entry segment is "(tabs)"; at the very root it is
    // undefined. Anything else - a link from an email, a specific patient - is a
    // deliberate destination and is left alone.
    const entry = segments[0];
    const openedTheApp = entry === undefined || entry === '(tabs)';
    if (!justSignedIn && !openedTheApp) return;

    appliedStartScreen.current = true;

    // Exactly one destination is chosen, always. An earlier version returned early
    // on some branches and simply never navigated, which left anyone signing in on
    // the web staring at a spinner: the sign-in screen waits to be replaced, and
    // nothing replaced it.
    const destination = pickDestination();
    if (justSignedIn || destination !== '/') router.replace(destination);

    function pickDestination(): '/' | '/capture' | '/patients' {
      // Someone here to read other people's readings - or invited to - should not
      // land on a camera. A pending invitation counts: they have no patients yet
      // and still need somewhere to accept.
      const isVisitingDoctor =
        (patientCount > 0 || pendingInvitations > 0) && readingCount === 0;
      if (isVisitingDoctor) return '/patients';

      // Honour the camera preference only where it can be honoured. In a browser
      // the camera opens only from a real tap, so a viewfinder route would be a
      // dead screen; Home already puts the button under the thumb.
      if (user!.startOnCamera && Platform.OS !== 'web') return '/capture';
      return '/';
    }
  }, [user, loading, patientCount, readingCount, pendingInvitations, segments, router]);

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
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="capture" options={{ headerShown: false }} />
      <Stack.Screen name="sign-in" options={{ headerShown: false }} />
      <Stack.Screen name="verify" options={{ headerShown: false }} />
      <Stack.Screen name="confirm" options={{ title: 'Check the numbers' }} />
      <Stack.Screen name="insights" options={{ title: 'What affects you' }} />
      <Stack.Screen name="tags" options={{ title: 'Context tags' }} />
      <Stack.Screen name="sharing" options={{ title: 'Who can see my readings' }} />
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
