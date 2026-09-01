import type { PoolClient } from 'pg';
import type {
  Arm,
  CreateReadingInput,
  ListReadingsQuery,
  Posture,
  Reading,
  ReadingSource,
  UpdateReadingInput,
  User,
} from '@mp/shared';
import { query, transaction } from '../../db/pool.js';
import { ApiError } from '../../lib/errors.js';
import { resolveSubject } from '../../lib/access.js';
import { imageStore } from '../../lib/storage.js';

interface ReadingRow {
  id: string;
  user_id: string;
  systolic: number;
  diastolic: number;
  pulse: number | null;
  measured_at: Date;
  note: string | null;
  arm: Arm;
  posture: Posture;
  source: ReadingSource;
  ocr_confidence: number | null;
  ocr_corrected: boolean;
  created_at: Date;
  image_object: string | null;
  tags: { id: string; label: string }[] | null;
}

const SELECT_READING = `
  select r.id, r.user_id, r.systolic, r.diastolic, r.pulse, r.measured_at, r.note,
         r.arm, r.posture, r.source, r.ocr_confidence, r.ocr_corrected, r.created_at,
         s.image_object,
         coalesce(
           (select json_agg(json_build_object('id', t.id, 'label', t.label) order by t.sort_order)
            from reading_tags rt join tags t on t.id = rt.tag_id
            where rt.reading_id = r.id),
           '[]'::json
         ) as tags
  from readings r
  left join scans s on s.id = r.scan_id`;

async function toReading(row: ReadingRow): Promise<Reading> {
  return {
    id: row.id,
    userId: row.user_id,
    systolic: row.systolic,
    diastolic: row.diastolic,
    pulse: row.pulse,
    measuredAt: row.measured_at.toISOString(),
    note: row.note,
    tagIds: (row.tags ?? []).map((t) => t.id),
    tags: row.tags ?? [],
    arm: row.arm,
    posture: row.posture,
    source: row.source,
    imageUrl: row.image_object ? await imageStore.signedUrl(row.image_object) : null,
    ocrConfidence: row.ocr_confidence,
    ocrCorrected: row.ocr_corrected,
    createdAt: row.created_at.toISOString(),
  };
}

/** Rejects tag ids that are not this user's, so one account cannot reference another's. */
async function linkTags(
  client: PoolClient,
  readingId: string,
  userId: string,
  tagIds: readonly string[],
): Promise<void> {
  await client.query('delete from reading_tags where reading_id = $1', [readingId]);
  if (tagIds.length === 0) return;

  const { rows } = await client.query<{ id: string }>(
    'select id from tags where user_id = $1 and id = any($2::uuid[])',
    [userId, [...tagIds]],
  );
  if (rows.length !== new Set(tagIds).size) {
    throw ApiError.badRequest('One of those tags does not exist.');
  }
  await client.query(
    `insert into reading_tags (reading_id, tag_id)
     select $1, unnest($2::uuid[])`,
    [readingId, rows.map((r) => r.id)],
  );
}

export async function listReadings(actor: User, params: ListReadingsQuery) {
  const subject = await resolveSubject(actor, params.patientId, 'list_readings');

  const conditions = ['r.user_id = $1'];
  const values: unknown[] = [subject.userId];
  const add = (fragment: string, value: unknown) => {
    values.push(value);
    conditions.push(fragment.replace('?', `$${values.length}`));
  };

  if (params.from) add('r.measured_at >= ?', params.from);
  if (params.to) add('r.measured_at <= ?', params.to);
  // Keyset pagination on (measured_at, id) - stable even when two readings share a
  // timestamp, which happens when you take three measurements in a row.
  if (params.cursor) {
    const [ts, id] = params.cursor.split('|');
    if (ts && id) {
      values.push(ts, id);
      conditions.push(`(r.measured_at, r.id) < ($${values.length - 1}::timestamptz, $${values.length}::uuid)`);
    }
  }
  values.push(params.limit);

  const { rows } = await query<ReadingRow>(
    `${SELECT_READING}
     where ${conditions.join(' and ')}
     order by r.measured_at desc, r.id desc
     limit $${values.length}`,
    values,
  );

  const readings = await Promise.all(rows.map(toReading));
  const last = rows[rows.length - 1];
  return {
    readings,
    nextCursor:
      rows.length === params.limit && last ? `${last.measured_at.toISOString()}|${last.id}` : null,
  };
}

export async function createReading(userId: string, input: CreateReadingInput): Promise<Reading> {
  const row = await transaction(async (client) => {
    let ocrConfidence: number | null = null;
    let ocrCorrected = false;

    if (input.scanId) {
      const { rows } = await client.query<{
        confidence: number | null;
        parsed: { systolic: number | null; diastolic: number | null; pulse: number | null } | null;
      }>('select confidence, parsed from scans where id = $1 and user_id = $2', [
        input.scanId,
        userId,
      ]);
      const scan = rows[0];
      if (!scan) throw ApiError.notFound('That scan does not exist.');

      ocrConfidence = scan.confidence;
      // Recording when the human overrode the machine gives us a free, honest
      // accuracy measure for the parser - no labelling effort required.
      ocrCorrected =
        scan.parsed !== null &&
        (scan.parsed.systolic !== input.systolic ||
          scan.parsed.diastolic !== input.diastolic ||
          (scan.parsed.pulse ?? null) !== (input.pulse ?? null));
    }

    const { rows: inserted } = await client.query<{ id: string }>(
      `insert into readings
         (user_id, systolic, diastolic, pulse, measured_at, note, arm, posture,
          source, scan_id, ocr_confidence, ocr_corrected)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       returning id`,
      [
        userId,
        input.systolic,
        input.diastolic,
        input.pulse ?? null,
        input.measuredAt,
        input.note ?? null,
        input.arm,
        input.posture,
        input.source,
        input.scanId ?? null,
        ocrConfidence,
        ocrCorrected,
      ],
    );
    const id = inserted[0]!.id;
    await linkTags(client, id, userId, input.tagIds);

    const { rows } = await client.query<ReadingRow>(`${SELECT_READING} where r.id = $1`, [id]);
    return rows[0]!;
  });

  return toReading(row);
}

export async function updateReading(
  userId: string,
  readingId: string,
  input: UpdateReadingInput,
): Promise<Reading> {
  const row = await transaction(async (client) => {
    const owned = await client.query<{ systolic: number; diastolic: number }>(
      'select systolic, diastolic from readings where id = $1 and user_id = $2 for update',
      [readingId, userId],
    );
    const current = owned.rows[0];
    if (!current) throw ApiError.notFound('Reading not found.');

    const nextSystolic = input.systolic ?? current.systolic;
    const nextDiastolic = input.diastolic ?? current.diastolic;
    if (nextSystolic <= nextDiastolic) {
      throw ApiError.unprocessable('Systolic must be higher than diastolic.');
    }

    const sets: string[] = [];
    const values: unknown[] = [readingId, userId];
    const push = (column: string, value: unknown) => {
      values.push(value);
      sets.push(`${column} = $${values.length}`);
    };

    if (input.systolic !== undefined) push('systolic', input.systolic);
    if (input.diastolic !== undefined) push('diastolic', input.diastolic);
    if (input.pulse !== undefined) push('pulse', input.pulse ?? null);
    if (input.measuredAt !== undefined) push('measured_at', input.measuredAt);
    if (input.note !== undefined) push('note', input.note ?? null);
    if (input.arm !== undefined) push('arm', input.arm);
    if (input.posture !== undefined) push('posture', input.posture);

    if (sets.length > 0) {
      await client.query(
        `update readings set ${sets.join(', ')}, updated_at = now()
         where id = $1 and user_id = $2`,
        values,
      );
    }
    if (input.tagIds !== undefined) {
      await linkTags(client, readingId, userId, input.tagIds);
    }

    const { rows } = await client.query<ReadingRow>(`${SELECT_READING} where r.id = $1`, [
      readingId,
    ]);
    return rows[0]!;
  });

  return toReading(row);
}

export async function deleteReading(userId: string, readingId: string): Promise<void> {
  const { rowCount } = await query('delete from readings where id = $1 and user_id = $2', [
    readingId,
    userId,
  ]);
  if (rowCount === 0) throw ApiError.notFound('Reading not found.');
}

export async function getReading(actor: User, readingId: string): Promise<Reading> {
  const { rows } = await query<ReadingRow>(`${SELECT_READING} where r.id = $1`, [readingId]);
  const row = rows[0];
  if (!row) throw ApiError.notFound('Reading not found.');
  // Re-uses the sharing rule rather than re-implementing it.
  await resolveSubject(actor, row.user_id, 'view_reading');
  return toReading(row);
}
