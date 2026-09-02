import type { User } from '@mp/shared';
import { query } from '../db/pool.js';
import { ApiError } from './errors.js';

export interface Subject {
  /** Whose readings are being looked at. */
  userId: string;
  /** False when a doctor is viewing a patient - sharing grants read access only. */
  canWrite: boolean;
}

/**
 * Resolves whose data a request is about, and whether the caller may change it.
 *
 * Every path into someone else's readings goes through here, so there is exactly
 * one place where the sharing rule lives - and exactly one place that writes the
 * access log. Health records should not be readable without a trace.
 */
export async function resolveSubject(
  actor: User,
  patientId: string | undefined,
  action: string,
): Promise<Subject> {
  if (!patientId || patientId === actor.id) {
    return { userId: actor.id, canWrite: true };
  }

  const { rows } = await query<{ id: string }>(
    `select id from shares
     where patient_id = $1 and doctor_id = $2 and status = 'active'`,
    [patientId, actor.id],
  );
  if (!rows[0]) {
    // Deliberately "not found" rather than "forbidden": a stranger should not be
    // able to discover that a given user id exists by probing this endpoint.
    throw ApiError.notFound('No shared record for that person.');
  }

  await query(
    `insert into access_log (actor_id, subject_id, action, detail) values ($1, $2, $3, $4)`,
    [actor.id, patientId, action, JSON.stringify({ shareId: rows[0].id })],
  );

  return { userId: patientId, canWrite: false };
}

export function requireWrite(subject: Subject): void {
  if (!subject.canWrite) {
    throw ApiError.forbidden('Shared records are read-only.');
  }
}
