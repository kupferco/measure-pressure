import type { CreateShareInput, Share, ShareStatus, User } from '@mp/shared';
import { config } from '../../config.js';
import { query, transaction } from '../../db/pool.js';
import { ApiError } from '../../lib/errors.js';
import { mailer } from '../../lib/mailer.js';

interface ShareRow {
  id: string;
  status: ShareStatus;
  created_at: Date;
  responded_at: Date | null;
  patient_id: string;
  patient_name: string | null;
  patient_email: string;
  doctor_id: string | null;
  doctor_name: string | null;
  doctor_email: string;
}

const SELECT_SHARE = `
  select s.id, s.status, s.created_at, s.responded_at,
         p.id as patient_id, p.name as patient_name, p.email as patient_email,
         d.id as doctor_id, d.name as doctor_name, s.doctor_email
  from shares s
  join users p on p.id = s.patient_id
  left join users d on d.id = s.doctor_id`;

function toShare(row: ShareRow): Share {
  return {
    id: row.id,
    patient: { id: row.patient_id, name: row.patient_name, email: row.patient_email },
    doctor: { id: row.doctor_id, name: row.doctor_name, email: row.doctor_email },
    status: row.status,
    createdAt: row.created_at.toISOString(),
    respondedAt: row.responded_at?.toISOString() ?? null,
  };
}

/** Shares this person granted (as a patient) and received (as a doctor). */
export async function listShares(user: User) {
  const [granted, received] = await Promise.all([
    query<ShareRow>(`${SELECT_SHARE} where s.patient_id = $1 order by s.created_at desc`, [user.id]),
    query<ShareRow>(
      `${SELECT_SHARE} where (s.doctor_id = $1 or s.doctor_email = $2)
       and s.status <> 'revoked' order by s.created_at desc`,
      [user.id, user.email],
    ),
  ]);
  return {
    granted: granted.rows.map(toShare),
    received: received.rows.map(toShare),
  };
}

export async function inviteDoctor(patient: User, input: CreateShareInput): Promise<Share> {
  if (input.doctorEmail === patient.email) {
    throw ApiError.badRequest('You already have access to your own readings.');
  }

  // Write and read-back are two statements on purpose. A data-modifying CTE and the
  // query around it run against the same snapshot, so a SELECT in the same statement
  // cannot see the row the INSERT just wrote - it silently returns nothing.
  const share = await transaction(async (client) => {
    // The doctor may not have an account yet; the invitation waits for the address.
    const { rows: doctorRows } = await client.query<{ id: string }>(
      'select id from users where email = $1',
      [input.doctorEmail],
    );
    const doctorId = doctorRows[0]?.id ?? null;

    const { rows: upserted } = await client.query<{ id: string }>(
      `insert into shares (patient_id, doctor_email, doctor_id, note)
       values ($1, $2, $3, $4)
       on conflict (patient_id, doctor_email) do update
         set status = 'pending', note = excluded.note,
             doctor_id = coalesce(shares.doctor_id, excluded.doctor_id),
             revoked_at = null, responded_at = null, created_at = now()
       returning id`,
      [patient.id, input.doctorEmail, doctorId, input.note ?? null],
    );

    const { rows } = await client.query<ShareRow>(`${SELECT_SHARE} where s.id = $1`, [
      upserted[0]!.id,
    ]);
    return toShare(rows[0]!);
  });

  const who = patient.name ?? patient.email;
  await mailer
    .send({
      to: input.doctorEmail,
      subject: `${who} wants to share their blood pressure readings with you`,
      text: [
        `${who} has invited you to see their blood pressure history in Measure Pressure.`,
        input.note ? `\nTheir note: ${input.note}` : '',
        `\nSign in to accept: ${config.WEB_ORIGIN}/doctor`,
        '\nYou will be able to view their readings and reports. You cannot change them.',
      ].join('\n'),
      html: `<p>${who} has invited you to see their blood pressure history in Measure Pressure.</p>
${input.note ? `<p><em>${input.note}</em></p>` : ''}
<p><a href="${config.WEB_ORIGIN}/doctor">Sign in to accept</a></p>
<p style="color:#666;font-size:13px">You will be able to view their readings and reports. You cannot change them.</p>`,
    })
    .catch((err: unknown) => {
      /*
       * The invitation row exists either way, and the doctor will see it when they
       * next sign in - so this is not fatal. But swallowing it silently means a
       * misconfigured sender looks like a doctor who never replied, so it is
       * logged with enough detail to act on.
       */
      console.error(
        '[shares] could not email the invitation to %s: %s',
        input.doctorEmail,
        err instanceof Error ? err.message : String(err),
      );
    });

  return share;
}

export async function respondToInvite(
  doctor: User,
  shareId: string,
  accept: boolean,
): Promise<Share> {
  // Same snapshot rule as above: update first, then read the row back.
  return transaction(async (client) => {
    const { rows: updated } = await client.query<{ id: string }>(
      // $3 is cast explicitly: it is used both as an enum value and compared to
      // text below, and Postgres cannot deduce one type for both uses.
      `update shares
       set status = $3::share_status,
           doctor_id = $1,
           responded_at = now(),
           revoked_at = case when $3::text = 'revoked' then now() else null end
       where id = $2
         and (doctor_id = $1 or doctor_email = $4)
         and status = 'pending'
       returning id`,
      [doctor.id, shareId, accept ? 'active' : 'revoked', doctor.email],
    );
    if (!updated[0]) throw ApiError.notFound('That invitation is no longer open.');

    const { rows } = await client.query<ShareRow>(`${SELECT_SHARE} where s.id = $1`, [
      updated[0].id,
    ]);
    return toShare(rows[0]!);
  });
}

/** Either side can end a share; the patient can always withdraw access. */
export async function revokeShare(user: User, shareId: string): Promise<void> {
  const { rowCount } = await query(
    `update shares set status = 'revoked', revoked_at = now()
     where id = $1 and (patient_id = $2 or doctor_id = $2) and status <> 'revoked'`,
    [shareId, user.id],
  );
  if (rowCount === 0) throw ApiError.notFound('Share not found.');
}

/** The doctor's list: who they can see, and how recently each person measured. */
export async function listPatients(doctor: User) {
  const { rows } = await query<{
    id: string;
    name: string | null;
    email: string;
    reading_count: number;
    last_measured_at: Date | null;
    last_systolic: number | null;
    last_diastolic: number | null;
  }>(
    `select p.id, p.name, p.email,
            count(r.id)::int as reading_count,
            max(r.measured_at) as last_measured_at,
            (array_agg(r.systolic order by r.measured_at desc))[1] as last_systolic,
            (array_agg(r.diastolic order by r.measured_at desc))[1] as last_diastolic
     from shares s
     join users p on p.id = s.patient_id
     left join readings r on r.user_id = p.id
     where s.doctor_id = $1 and s.status = 'active'
     group by p.id
     order by max(r.measured_at) desc nulls last`,
    [doctor.id],
  );

  return {
    patients: rows.map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      readingCount: r.reading_count,
      lastMeasuredAt: r.last_measured_at?.toISOString() ?? null,
      lastReading:
        r.last_systolic !== null && r.last_diastolic !== null
          ? { systolic: r.last_systolic, diastolic: r.last_diastolic }
          : null,
    })),
  };
}
