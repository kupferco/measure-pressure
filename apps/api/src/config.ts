import { z } from 'zod';

/**
 * Every environment variable the API reads, validated once at boot so a missing
 * value fails loudly on startup instead of at 6am when you photograph a reading.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_ENV: z.enum(['local', 'staging', 'prod']).default('local'),
  PORT: z.coerce.number().int().default(8080),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  // Postgres. On Cloud Run this is the Cloud SQL unix socket form:
  //   postgresql://user:pass@/dbname?host=/cloudsql/PROJECT:REGION:INSTANCE
  DATABASE_URL: z.string().min(1),
  DATABASE_MAX_POOL: z.coerce.number().int().min(1).max(50).default(5),

  // Where the browser app lives. Used for CORS and for the link in the login email.
  WEB_ORIGIN: z.string().url().default('http://localhost:5173'),
  /** Extra origins allowed through CORS, comma separated (Expo dev server, staging preview). */
  EXTRA_ORIGINS: z.string().default(''),
  /** Deep-link scheme so a magic link opened on the phone lands in the native app. */
  MOBILE_SCHEME: z.string().default('measurepressure'),

  SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(60),
  MAGIC_LINK_TTL_MINUTES: z.coerce.number().int().min(1).max(1440).default(15),
  COOKIE_DOMAIN: z.string().optional(),

  MAIL_TRANSPORT: z.enum(['console', 'resend']).default('console'),
  MAIL_FROM: z.string().default('Measure Pressure <onboarding@resend.dev>'),
  RESEND_API_KEY: z.string().optional(),

  /** Bucket holding the Omron photos. Omit locally to keep images on disk instead. */
  GCS_BUCKET: z.string().optional(),
  LOCAL_UPLOAD_DIR: z.string().default('.uploads'),
  GOOGLE_CLOUD_PROJECT: z.string().optional(),
});

export type Config = z.infer<typeof envSchema> & {
  isProduction: boolean;
  allowedOrigins: string[];
};

function load(): Config {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  const env = parsed.data;

  if (env.MAIL_TRANSPORT === 'resend' && !env.RESEND_API_KEY) {
    throw new Error('MAIL_TRANSPORT=resend requires RESEND_API_KEY');
  }

  const extra = env.EXTRA_ORIGINS.split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  return {
    ...env,
    isProduction: env.APP_ENV === 'prod',
    allowedOrigins: [env.WEB_ORIGIN, ...extra],
  };
}

export const config = load();
