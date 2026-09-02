import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Platform, StyleSheet, Switch, TextInput, View } from 'react-native';
import { Body, Button, Caption, Card, ErrorNote, Heading, Label, Screen } from '../../src/components/ui';
import { api } from '../../src/lib/api';
import { useAuth } from '../../src/lib/auth';
import { colors, radius, spacing, type } from '../../src/lib/theme';

/**
 * Profile and account.
 *
 * The name lives here rather than on the sign-in screen: it is something you set
 * once and can correct, not a credential. The account itself is the email address.
 */
export default function ProfileScreen() {
  const { user, readingCount, refresh, signOut } = useAuth();
  const router = useRouter();

  const [name, setName] = useState(user?.name ?? '');
  const [startOnCamera, setStartOnCamera] = useState(user?.startOnCamera ?? true);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState('');
  const [showDelete, setShowDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const saveName = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.updateProfile({ name: name.trim() });
      await refresh();
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that.');
    } finally {
      setBusy(false);
    }
  };

  const setStartScreen = async (next: boolean) => {
    // Optimistic: the switch should move under the thumb, not after a round trip.
    setStartOnCamera(next);
    try {
      await api.updateProfile({ startOnCamera: next });
      await refresh();
    } catch (err) {
      setStartOnCamera(!next);
      setError(err instanceof Error ? err.message : 'Could not save that preference.');
    }
  };

  const deleteEverything = async () => {
    setBusy(true);
    setError(null);
    try {
      const { deleted } = await api.deleteAllReadings(confirmEmail);
      await refresh();
      const done = `Deleted ${deleted} reading${deleted === 1 ? '' : 's'}.`;
      if (Platform.OS === 'web') globalThis.alert?.(done);
      else Alert.alert('Done', done);
      router.replace('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete those readings.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <View style={{ gap: spacing.xs }}>
        <Label>Signed in as</Label>
        <Body>{user?.email}</Body>
        <Caption>Your readings are found by this address. It cannot be changed here.</Caption>
      </View>

      <View style={{ gap: spacing.sm }}>
        <Label>Your name</Label>
        <TextInput
          value={name}
          onChangeText={(text) => {
            setName(text);
            setSaved(false);
          }}
          placeholder="What your doctor should see"
          placeholderTextColor={colors.textFaint}
          autoCapitalize="words"
          accessibilityLabel="Your name"
          style={styles.input}
        />
        <Caption>Shown to anyone you share your readings with.</Caption>
        <Button label={saved ? 'Saved' : 'Save name'} onPress={saveName} loading={busy} disabled={saved} />
      </View>

      {/*
        Opening straight on the camera suits the common case - open, shoot, done -
        but someone reviewing more than recording wants the dashboard, so it is a
        preference rather than an assumption.
      */}
      <View style={styles.toggleRow}>
        <View style={{ flex: 1, gap: 2 }}>
          <Body>Open on the camera</Body>
          <Caption>
            {Platform.OS === 'web'
              ? 'In a browser the camera can only be opened by a tap, so the app always opens on Home - where the camera button is.'
              : startOnCamera
                ? 'The app opens ready to photograph your monitor.'
                : 'The app opens on Home, with your chart.'}
          </Caption>
        </View>
        <Switch
          disabled={Platform.OS === 'web'}
          value={startOnCamera}
          onValueChange={setStartScreen}
          accessibilityLabel="Open on the camera"
          trackColor={{ true: colors.accent, false: colors.surfaceRaised }}
        />
      </View>

      <ErrorNote message={error} />

      <View style={{ gap: spacing.sm, marginTop: spacing.lg }}>
        <Button label="Who can see my readings" variant="secondary" onPress={() => router.push('/sharing')} />
        <Button label="Edit tags" variant="secondary" onPress={() => router.push('/tags')} />
        <Button label="Sign out" variant="ghost" onPress={signOut} />
      </View>

      {/*
        Starting over is a real need, not an edge case: the first thing anyone does
        with a tracker is fill it with test entries, and the second is want them gone
        before recording anything they actually care about.
      */}
      <Card style={{ borderWidth: 1, borderColor: colors.danger, backgroundColor: 'transparent', marginTop: spacing.xl }}>
        <Heading>Start over</Heading>
        <Caption>
          Deletes all {readingCount} of your readings and the photos behind them. Your account, your
          tags and anyone you have shared with are kept. This cannot be undone.
        </Caption>

        {showDelete ? (
          <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
            <Caption>Type {user?.email} to confirm.</Caption>
            <TextInput
              value={confirmEmail}
              onChangeText={setConfirmEmail}
              placeholder={user?.email}
              placeholderTextColor={colors.textFaint}
              autoCapitalize="none"
              autoCorrect={false}
              accessibilityLabel="Type your email to confirm deletion"
              style={styles.input}
            />
            <Button
              label="Delete all my readings"
              variant="danger"
              loading={busy}
              disabled={confirmEmail.trim().toLowerCase() !== user?.email}
              onPress={deleteEverything}
            />
            <Button label="Cancel" variant="ghost" onPress={() => setShowDelete(false)} />
          </View>
        ) : (
          <Button
            label="Delete all my readings…"
            variant="danger"
            style={{ alignSelf: 'flex-start', paddingHorizontal: 0 }}
            onPress={() => setShowDelete(true)}
          />
        )}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  input: {
    ...type.body,
    color: colors.text,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    minHeight: 52,
  },
});
