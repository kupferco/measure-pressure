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
type Patient = {
  id: string;
  name: string | null;
  email: string;
  readingCount: number;
  lastMeasuredAt: string | null;
  lastReading: { systolic: number; diastolic: number } | null;
};

export default function SharingScreen() {
  const router = useRouter();
  const [shares, setShares] = useState<{ granted: Share[]; received: Share[] } | null>(null);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const load = async () => {
    try {
      const [shareResult, patientResult] = await Promise.all([
        api.listShares(),
        // Only meaningful for a doctor; an empty list for everyone else.
        api.listPatients().catch(() => ({ patients: [] })),
      ]);
      setShares(shareResult);
      setPatients(patientResult.patients);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load sharing.');
    }
  };

  const respond = async (id: string, accept: boolean) => {
    await api.respondToShare(id, accept).catch(() => {});
    await load();
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

      {shares.received.some((share) => share.status === 'pending') ? (
        <View style={{ gap: spacing.sm }}>
          <Label>Invitations for you</Label>
          {shares.received
            .filter((share) => share.status === 'pending')
            .map((share) => (
              <Card key={share.id}>
                <Body>{share.patient.name ?? share.patient.email}</Body>
                <Caption>wants to share their blood pressure readings with you</Caption>
                <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                  <Button label="Accept" onPress={() => respond(share.id, true)} style={{ flex: 1 }} />
                  <Button
                    label="Decline"
                    variant="secondary"
                    onPress={() => respond(share.id, false)}
                    style={{ flex: 1 }}
                  />
                </View>
              </Card>
            ))}
        </View>
      ) : null}

      {patients.length > 0 ? (
        <View style={{ gap: spacing.sm }}>
          <Label>People sharing with you</Label>
          {patients.map((patient) => (
            <Pressable
              key={patient.id}
              accessibilityRole="button"
              accessibilityLabel={`View readings for ${patient.name ?? patient.email}`}
              onPress={() =>
                router.push({
                  pathname: '/patient/[id]',
                  params: { id: patient.id, name: patient.name ?? patient.email },
                })
              }
            >
              <Card>
                <Body>{patient.name ?? patient.email} →</Body>
                <Caption>
                  {patient.readingCount} readings
                  {patient.lastReading
                    ? ` · last ${patient.lastReading.systolic}/${patient.lastReading.diastolic}`
                    : ''}
                  {patient.lastMeasuredAt
                    ? ` · ${new Date(patient.lastMeasuredAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`
                    : ''}
                </Caption>
              </Card>
            </Pressable>
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
