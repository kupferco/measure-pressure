import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Platform, View } from 'react-native';
import { Body, Button, Loading, Screen, Title } from '../src/components/ui';
import { api } from '../src/lib/api';
import { useAuth } from '../src/lib/auth';
import { spacing } from '../src/lib/theme';

/**
 * Where the link in the login email lands.
 *
 * The email carries two credentials for the same login - a six-digit code for
 * typing into the app, and this link for a browser. The doctor only ever uses the
 * web build, and will click rather than type, so this is their whole way in.
 */
export default function VerifyScreen() {
  const { token } = useLocalSearchParams<{ token?: string }>();
  const { signInWithToken } = useAuth();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  // A login token is single-use: React running this effect twice (StrictMode, a
  // re-render) would spend it on the first pass and fail on the second.
  const attempted = useRef(false);

  useEffect(() => {
    if (attempted.current) return;
    attempted.current = true;

    if (!token) {
      setError('That link is missing its sign-in code. Try the six digits instead.');
      return;
    }
    signInWithToken(token)
      .then(async () => {
        /*
         * The sign-in email cannot know who is clicking it, so every link lands
         * here. Someone with patients sharing with them and no readings of their
         * own is a clinician, and belongs in the other app - which is served from
         * the same origin, so the session cookie just made is already valid there.
         */
        const { patientCount, readingCount, pendingInvitations } = await api.me();
        const isClinician = (patientCount > 0 || pendingInvitations > 0) && readingCount === 0;
        if (isClinician && Platform.OS === 'web') {
          globalThis.location.assign('/doctor');
          return;
        }
        router.replace('/');
      })
      .catch((err) =>
        setError(
          err instanceof Error
            ? err.message
            : 'That link has expired or was already used. Ask for a new one.',
        ),
      );
  }, [token, signInWithToken, router]);

  if (!error) return <Loading label="Signing you in…" />;

  return (
    <Screen>
      <View style={{ gap: spacing.md, marginTop: spacing.xxl }}>
        <Title>That link did not work</Title>
        <Body muted>{error}</Body>
        <Button label="Sign in again" onPress={() => router.replace('/sign-in')} />
      </View>
    </Screen>
  );
}
