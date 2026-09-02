import { z } from 'zod';
import { PLAUSIBLE } from './bp.js';
import { ARMS, POSTURES, TAG_GROUPS } from './tags.js';

export const emailSchema = z.string().trim().toLowerCase().email().max(320);
export const uuidSchema = z.string().uuid();
export const isoDateTimeSchema = z.string().datetime({ offset: true });

// ---------------------------------------------------------------- auth

/**
 * Signing in needs nothing but an address. A name is profile information - asking
 * for it at the door invites the same person to be "Daniel Kupfer" one week and
 * "Dani" the next, when the account was only ever keyed by email anyway.
 */
export const requestMagicLinkSchema = z.object({
  email: emailSchema,
});
export type RequestMagicLinkInput = z.infer<typeof requestMagicLinkSchema>;

export const verifyMagicLinkSchema = z.object({
  token: z.string().min(20).max(200),
});
export type VerifyMagicLinkInput = z.infer<typeof verifyMagicLinkSchema>;

export const userSchema = z.object({
  id: uuidSchema,
  email: emailSchema,
  name: z.string().nullable(),
  /** Which screen the app opens on. True is the camera. */
  startOnCamera: z.boolean(),
  createdAt: isoDateTimeSchema,
});
export type User = z.infer<typeof userSchema>;

// ---------------------------------------------------------------- tags

export const tagSchema = z.object({
  id: uuidSchema,
  label: z.string(),
  group: z.enum(TAG_GROUPS as unknown as [string, ...string[]]),
  sortOrder: z.number().int(),
  archived: z.boolean(),
  /** How many readings carry this tag - lets the UI put your real habits on top. */
  usageCount: z.number().int().optional(),
});
export type Tag = z.infer<typeof tagSchema>;

export const createTagSchema = z.object({
  label: z.string().trim().min(1).max(60),
  group: z.enum(TAG_GROUPS as unknown as [string, ...string[]]).default('custom'),
});
export type CreateTagInput = z.infer<typeof createTagSchema>;

export const updateTagSchema = z.object({
  label: z.string().trim().min(1).max(60).optional(),
  group: z.enum(TAG_GROUPS as unknown as [string, ...string[]]).optional(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
  archived: z.boolean().optional(),
});
export type UpdateTagInput = z.infer<typeof updateTagSchema>;

// ---------------------------------------------------------------- readings

const systolic = z.number().int().min(PLAUSIBLE.systolic.min).max(PLAUSIBLE.systolic.max);
const diastolic = z.number().int().min(PLAUSIBLE.diastolic.min).max(PLAUSIBLE.diastolic.max);
const pulse = z.number().int().min(PLAUSIBLE.pulse.min).max(PLAUSIBLE.pulse.max);

export const READING_SOURCES = ['photo', 'manual'] as const;
export type ReadingSource = (typeof READING_SOURCES)[number];

export const readingCoreSchema = z.object({
  systolic,
  diastolic,
  pulse: pulse.nullable().optional(),
  measuredAt: isoDateTimeSchema,
  note: z.string().trim().max(2000).nullable().optional(),
  tagIds: z.array(uuidSchema).max(20).default([]),
  arm: z.enum(ARMS).default('unknown'),
  posture: z.enum(POSTURES).default('unknown'),
});

export const createReadingSchema = readingCoreSchema
  .extend({
    source: z.enum(READING_SOURCES).default('manual'),
    /** Set when the numbers came from a scan the user then confirmed. */
    scanId: uuidSchema.nullable().optional(),
  })
  .refine((r) => r.systolic > r.diastolic, {
    message: 'Systolic must be higher than diastolic',
    path: ['systolic'],
  });
export type CreateReadingInput = z.infer<typeof createReadingSchema>;

export const updateReadingSchema = readingCoreSchema.partial();
export type UpdateReadingInput = z.infer<typeof updateReadingSchema>;

export const updateProfileSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  startOnCamera: z.boolean().optional(),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export const readingSchema = readingCoreSchema.extend({
  id: uuidSchema,
  userId: uuidSchema,
  /**
   * Readings taken in one sitting share this. Clients group by it to show "average
   * of 3" rather than three separate entries a minute apart.
   */
  sessionId: uuidSchema,
  source: z.enum(READING_SOURCES),
  tags: z.array(z.object({ id: uuidSchema, label: z.string() })),
  imageUrl: z.string().nullable(),
  /** 0-1. Null for manual entries. Low values mean "the OCR guessed". */
  ocrConfidence: z.number().min(0).max(1).nullable(),
  /** True when the user changed a number the OCR proposed - useful for tuning the parser. */
  ocrCorrected: z.boolean(),
  createdAt: isoDateTimeSchema,
});
export type Reading = z.infer<typeof readingSchema>;

export const listReadingsQuerySchema = z.object({
  from: isoDateTimeSchema.optional(),
  to: isoDateTimeSchema.optional(),
  /** A doctor passes the patient they are viewing; patients omit it. */
  patientId: uuidSchema.optional(),
  limit: z.coerce.number().int().min(1).max(1000).default(200),
  cursor: z.string().max(200).optional(),
});
export type ListReadingsQuery = z.infer<typeof listReadingsQuerySchema>;

// ---------------------------------------------------------------- scanning

/** What Cloud Vision + the Omron parser think is on the display, before a human confirms. */
export const scanResultSchema = z.object({
  scanId: uuidSchema,
  systolic: z.number().int().nullable(),
  diastolic: z.number().int().nullable(),
  pulse: z.number().int().nullable(),
  /** 0-1, our own blend of Vision's confidence and how well the layout matched. */
  confidence: z.number().min(0).max(1),
  /** Human-readable reasons the parse is shaky, shown on the confirm screen. */
  warnings: z.array(z.string()),
  imageUrl: z.string().nullable(),
});
export type ScanResult = z.infer<typeof scanResultSchema>;

// ---------------------------------------------------------------- sharing

export const SHARE_STATUSES = ['pending', 'active', 'revoked'] as const;
export type ShareStatus = (typeof SHARE_STATUSES)[number];

export const createShareSchema = z.object({
  doctorEmail: emailSchema,
  note: z.string().trim().max(500).optional(),
});
export type CreateShareInput = z.infer<typeof createShareSchema>;

export const shareSchema = z.object({
  id: uuidSchema,
  patient: z.object({ id: uuidSchema, name: z.string().nullable(), email: emailSchema }),
  doctor: z.object({ id: uuidSchema.nullable(), name: z.string().nullable(), email: emailSchema }),
  status: z.enum(SHARE_STATUSES),
  createdAt: isoDateTimeSchema,
  respondedAt: isoDateTimeSchema.nullable(),
});
export type Share = z.infer<typeof shareSchema>;

// ---------------------------------------------------------------- reports

export const reportQuerySchema = z.object({
  from: isoDateTimeSchema.optional(),
  to: isoDateTimeSchema.optional(),
  patientId: uuidSchema.optional(),
  /**
   * IANA zone of the person reading the report. "Morning" has to mean morning where
   * they were standing, not UTC, or the time-of-day split is meaningless for anyone
   * who travels.
   */
  tz: z.string().max(64).default('UTC'),
});
export type ReportQuery = z.infer<typeof reportQuerySchema>;

export const TIME_BUCKETS = ['morning', 'afternoon', 'evening', 'night'] as const;
export type TimeBucket = (typeof TIME_BUCKETS)[number];

export const summarySchema = z.object({
  readingCount: z.number().int(),
  from: isoDateTimeSchema.nullable(),
  to: isoDateTimeSchema.nullable(),
  average: z.object({ systolic: z.number(), diastolic: z.number(), pulse: z.number().nullable() }),
  /** The morning/evening split doctors usually ask about. */
  byTimeOfDay: z.array(
    z.object({
      bucket: z.enum(TIME_BUCKETS),
      count: z.number().int(),
      systolic: z.number(),
      diastolic: z.number(),
    }),
  ),
  categoryBreakdown: z.array(z.object({ category: z.string(), count: z.number().int() })),
  /** Least-squares slope in mmHg per 30 days. Negative is improving. */
  trend: z
    .object({ systolic: z.number(), diastolic: z.number(), days: z.number().int() })
    .nullable(),
});
export type Summary = z.infer<typeof summarySchema>;

export const insightSchema = z.object({
  tagId: uuidSchema,
  label: z.string(),
  withCount: z.number().int(),
  withoutCount: z.number().int(),
  /** Difference in mean systolic: tagged readings minus untagged. Positive = higher when tagged. */
  systolicDelta: z.number(),
  diastolicDelta: z.number(),
  /** Welch t-test p-value. We only call an insight confident when the data supports it. */
  pValue: z.number().nullable(),
  confident: z.boolean(),
});
export type Insight = z.infer<typeof insightSchema>;
