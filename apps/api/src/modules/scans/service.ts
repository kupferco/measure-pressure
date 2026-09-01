import type { ScanResult } from '@mp/shared';
import { query } from '../../db/pool.js';
import { ApiError } from '../../lib/errors.js';
import { imageStore } from '../../lib/storage.js';
import { parseOmronDisplay } from './omron-parser.js';
import { getOcrEngine } from './vision.js';

/** Cloud Vision cannot decode HEIC, which is what an iPhone shoots by default. */
const ACCEPTED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export async function scanImage(
  userId: string,
  image: Buffer,
  contentType: string,
): Promise<ScanResult> {
  if (!ACCEPTED_TYPES.has(contentType)) {
    throw ApiError.unprocessable(
      `Cannot read ${contentType || 'that file type'}. Send a JPEG, PNG or WebP.`,
    );
  }
  if (image.byteLength === 0) throw ApiError.badRequest('The photo was empty.');

  // Store the photo before doing anything clever with it. If Vision is down or the
  // parser trips, the capture is still on record and can be re-run later.
  const objectName = await imageStore.save(image, contentType);

  let tokens;
  let raw: unknown = null;
  try {
    const detection = await getOcrEngine().detect(image);
    tokens = detection.tokens;
    raw = detection.raw;
  } catch (err) {
    // A failed read must not lose the capture: record it and let the user type the
    // numbers on the confirm screen they were going to see anyway.
    const { rows } = await query<{ id: string }>(
      `insert into scans (user_id, image_object, vision_raw, parsed, confidence)
       values ($1, $2, $3, $4, 0) returning id`,
      [userId, objectName, JSON.stringify({ error: String(err) }), null],
    );
    return {
      scanId: rows[0]!.id,
      systolic: null,
      diastolic: null,
      pulse: null,
      confidence: 0,
      warnings: ['The photo could not be read automatically. Please enter the numbers.'],
      imageUrl: await imageStore.signedUrl(objectName),
    };
  }

  const parsed = parseOmronDisplay(tokens);

  const { rows } = await query<{ id: string }>(
    `insert into scans (user_id, image_object, vision_raw, parsed, confidence)
     values ($1, $2, $3, $4, $5) returning id`,
    [userId, objectName, JSON.stringify(raw ?? null), JSON.stringify(parsed), parsed.confidence],
  );

  return {
    scanId: rows[0]!.id,
    systolic: parsed.systolic,
    diastolic: parsed.diastolic,
    pulse: parsed.pulse,
    confidence: parsed.confidence,
    warnings: parsed.warnings,
    imageUrl: await imageStore.signedUrl(objectName),
  };
}

/** Local-store image serving. Ownership is checked against the scans table. */
export async function readOwnedImage(userId: string, objectName: string): Promise<Buffer | null> {
  const { rows } = await query<{ id: string }>(
    'select id from scans where user_id = $1 and image_object = $2',
    [userId, objectName],
  );
  if (!rows[0]) throw ApiError.notFound('Image not found.');
  return imageStore.read(objectName);
}
