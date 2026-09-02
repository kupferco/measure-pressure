import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Share } from '@mp/shared';
import { api, type Patient } from '../api';
import { useAuth } from '../auth';

/**
 * Who has shared with you, and who is waiting for an answer.
 */
export function PatientsPage() {
  const { user, signOut, refresh } = useAuth();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [invitations, setInvitations] = useState<Share[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [patientResult, shareResult] = await Promise.all([api.listPatients(), api.listShares()]);
      setPatients(patientResult.patients);
      setInvitations(shareResult.received.filter((s) => s.status === 'pending'));
      setError(null);
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

  if (loading) return <div className="page"><p className="muted">Loading…</p></div>;

  return (
    <div className="page stack">
      <div className="spread">
        <h1>Patients</h1>
        <div className="row">
          <span className="small muted">{user?.name ?? user?.email}</span>
          <button className="secondary" onClick={signOut}>Sign out</button>
        </div>
      </div>

      {error ? <div className="error">{error}</div> : null}

      {invitations.length > 0 ? (
        <div className="stack" style={{ gap: 8 }}>
          <h2>Waiting for you</h2>
          {invitations.map((share) => (
            <div key={share.id} className="card spread">
              <div>
                <strong>{share.patient.name ?? share.patient.email}</strong>
                <p className="small muted">would like to share their blood pressure readings</p>
              </div>
              <div className="row">
                <button onClick={() => respond(share.id, true)}>Accept</button>
                <button className="secondary" onClick={() => respond(share.id, false)}>
                  Decline
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {patients.length === 0 && invitations.length === 0 ? (
        <div className="card">
          <h2>Nobody has shared with you yet</h2>
          <p className="muted">
            When a patient invites you from their app, the invitation appears here. You will be able
            to read their readings and reports, but never change them.
          </p>
        </div>
      ) : null}

      {patients.map((patient) => (
        <Link
          key={patient.id}
          to={`/patients/${patient.id}`}
          className="card spread"
          style={{ textDecoration: 'none', color: 'inherit' }}
        >
          <div>
            <strong>{patient.name ?? patient.email}</strong>
            <p className="small muted">
              {patient.readingCount} readings
              {patient.lastMeasuredAt
                ? ` · last on ${new Date(patient.lastMeasuredAt).toLocaleDateString(undefined, {
                    day: 'numeric',
                    month: 'short',
                  })}`
                : ' · nothing recorded yet'}
            </p>
          </div>
          {patient.lastReading ? (
            <span className="tabular" style={{ fontSize: 20, fontWeight: 600 }}>
              {patient.lastReading.systolic}/{patient.lastReading.diastolic}
            </span>
          ) : null}
        </Link>
      ))}

      <p className="small faint">
        Opening a patient's readings is recorded, so they can see who looked and when.
      </p>
    </div>
  );
}
