import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import type { Share } from '@mp/shared';
import { Body, Button, Caption, Card, EmptyState, ErrorNote, Heading, Label, Loading, Screen } from '../src/components/ui';
import { api } from '../src/lib/api';
import { useAuth } from '../src/lib/auth';
import { colors, spacing } from '../src/lib/theme';

type Patient = {
  id: string;
  name: string | null;
  email: string;
  readingCount: number;
  lastMeasuredAt: string | null;
  lastReading: { systolic: number; diastolic: number } | null;
};

/**
 * The doctor's home.
 *
 * Nobody is flagged as a doctor anywhere - this screen is simply what you see when
 * other people have shared their readings with you. Someone can perfectly well have
 * patients here and their own readings on the camera screen.
 */
export default function PatientsScreen() {
  const router = useRouter();
  const { readingCount, refresh } = useAuth();

  const [patients, setPatients] = useState<Patient[]>([]);
  const [invitations, setInvitations] = useState<Share[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [patientResult, shareResult] = await Promise.all([api.listPatients(), api.listShares()]);
      setPatients(patientResult.patients);
      setInvitations(shareResult.received.filter((s) => s.status === 'pending'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load your patients.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const respond = async (id: string, accept: boolean) => {
    await api.respondToShare(id, accept).catch(() => {});
    await Promise.all([load(), refresh()]);
  };

  if (loading) return <Loading />;

  return (
    <Screen>
      <ErrorNote message={error} />

      {invitations.length > 0 ? (
        <View style={{ gap: spacing.sm }}>
          <Label>Waiting for you</Label>
          {invitations.map((share) => (
            <Card key={share.id}>
              <Body>{share.patient.name ?? share.patient.email}</Body>
              <Caption>would like to share their blood pressure readings with you</Caption>
              <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs }}>
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

      {patients.length === 0 && invitations.length === 0 ? (
        <EmptyState
          title="No one has shared with you yet"
          body="When a patient invites you, their invitation appears here. You will be able to read their readings and reports, but never change them."
        />
      ) : null}

      {patients.length > 0 ? (
        <View style={{ gap: spacing.sm }}>
          <Label>{patients.length} sharing with you</Label>
          {patients.map((patient) => (
            <Pressable
              key={patient.id}
              accessibilityRole="button"
              accessibilityLabel={`Open readings for ${patient.name ?? patient.email}`}
              onPress={() =>
                router.push({
                  pathname: '/patient/[id]',
                  params: { id: patient.id, name: patient.name ?? patient.email },
                })
              }
            >
              <Card>
                <Heading>{patient.name ?? patient.email}</Heading>
                <Caption>
                  {patient.readingCount} readings
                  {patient.lastReading
                    ? ` · last ${patient.lastReading.systolic}/${patient.lastReading.diastolic}`
                    : ' · nothing recorded yet'}
                  {patient.lastMeasuredAt
                    ? ` · ${new Date(patient.lastMeasuredAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`
                    : ''}
                </Caption>
              </Card>
            </Pressable>
          ))}
        </View>
      ) : null}

      <View style={{ gap: spacing.sm, marginTop: 'auto' }}>
        {/* A doctor may also be tracking their own pressure. */}
        <Button
          label={readingCount > 0 ? 'My own readings' : 'Track my own pressure'}
          variant="secondary"
          onPress={() => router.replace('/')}
        />
        <Button label="Profile" variant="ghost" onPress={() => router.push('/profile')} />
      </View>

      <Caption style={{ color: colors.textFaint }}>
        Every time you open someone's readings it is recorded, so they can see who looked and when.
      </Caption>
    </Screen>
  );
}
