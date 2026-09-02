import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import type { Share } from '@mp/shared';
import { Body, Button, Caption, Card, ErrorNote, Heading, Label, Loading, Screen } from '../src/components/ui';
import { api } from '../src/lib/api';
import { colors, radius, spacing, type } from '../src/lib/theme';

/**
 * Doctor access.
 *
 * Invitations are addressed by email, so a doctor who has never used the app can
 * still be invited - the invitation waits for them. Access is read-only and can be
 * withdrawn at any time from here.
 */
export default function SharingScreen() {
  const router = useRouter();
  const [shares, setShares] = useState<{ granted: Share[]; received: Share[] } | null>(null);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const load = async () => {
    try {
      setShares(await api.listShares());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load sharing.');
    }
  };

  useEffect(() => {
    load();
  }, []);

  const invite = async () => {
    const trimmed = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(trimmed)) {
      setError('That does not look like an email address.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.inviteDoctor(trimmed);
      setEmail('');
      setSent(true);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send that invitation.');
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (id: string) => {
    await api.revokeShare(id).catch(() => {});
    await load();
  };

  if (!shares) return <Loading />;

  return (
    <Screen>
      <View style={{ gap: spacing.sm }}>
        <Heading>Invite your doctor</Heading>
        <Caption>
          They will be able to read your readings and reports. They cannot change or delete
          anything, and you can withdraw access whenever you like.
        </Caption>
      </View>

      <View style={{ gap: spacing.sm }}>
        <TextInput
          value={email}
          onChangeText={(text) => {
            setEmail(text);
            setSent(false);
          }}
          placeholder="doctor@surgery.com"
          placeholderTextColor={colors.textFaint}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel="Doctor's email address"
          style={styles.input}
        />
        <Button label="Send invitation" onPress={invite} loading={busy} />
        {sent ? <Caption>Invitation sent.</Caption> : null}
      </View>

      <ErrorNote message={error} />

      {shares.granted.length > 0 ? (
        <View style={{ gap: spacing.sm }}>
          <Label>People who can see your readings</Label>
          {shares.granted.map((share) => (
            <Card key={share.id}>
              <Body>{share.doctor.name ?? share.doctor.email}</Body>
              <Caption>
                {share.status === 'active'
                  ? 'Has access'
                  : share.status === 'pending'
                    ? 'Invited - waiting for them to accept'
                    : 'Access withdrawn'}
              </Caption>
              {share.status !== 'revoked' ? (
                <Button
                  label={share.status === 'active' ? 'Withdraw access' : 'Cancel invitation'}
                  variant="danger"
                  onPress={() => revoke(share.id)}
                  style={{ alignSelf: 'flex-start', paddingHorizontal: 0 }}
                />
              ) : null}
            </Card>
          ))}
        </View>
      ) : null}

    </Screen>
  );
}

const styles = StyleSheet.create({
  input: {
    ...type.body,
    color: colors.text,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    minHeight: 52,
  },
});
