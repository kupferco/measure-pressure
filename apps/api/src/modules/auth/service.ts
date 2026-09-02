import type { PoolClient } from 'pg';
import { SEED_TAGS, type UserRole, type User } from '@mp/shared';
import { config } from '../../config.js';
import { query, transaction } from '../../db/pool.js';
import { ApiError } from '../../lib/errors.js';
import { generateToken, hashToken } from '../../lib/tokens.js';
import { buildLoginEmail, mailer } from '../../lib/mailer.js';

const MAX_CODE_ATTEMPTS = 5;
/** Stops someone spamming another person's inbox by hammering the login endpoint. */
const MAX_LINKS_PER_HOUR = 6;

interface UserRow {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  created_at: Date;
}

export function toUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    createdAt: row.created_at.toISOString(),
  };
}

/** Six digits, uniformly distributed, leading zeros preserved. */
function generateCode(): string {
  const n = Math.floor(Math.random() * 1_000_000);
  return n.toString().padStart(6, '0');
}

async function seedTags(client: PoolClient, userId: string): Promise<void> {
  if (SEED_TAGS.length === 0) return;
  const values: string[] = [];
  const params: unknown[] = [userId];
  SEED_TAGS.forEach((tag, i) => {
    const base = params.length;
    values.push(`($1, $${base + 1}, $${base + 2}, $${base + 3})`);
    params.push(tag.label, tag.group, i);
  });
  await client.query(
    `insert into tags (user_id, label, tag_group, sort_order) values ${values.join(', ')}`,
    params,
  );
}

/**
 * Finds the account for an email, creating it on first sight. Registration and
 * login are the same act when there is no password to set.
 */
async function findOrCreateUser(
  client: PoolClient,
  email: string,
  name: string | undefined,
  role: UserRole | undefined,
): Promise<{ user: UserRow; isNew: boolean }> {
  const existing = await client.query<UserRow>(
    'select id, email, name, role, created_at from users where email = $1',
    [email],
  );
  if (existing.rows[0]) return { user: existing.rows[0], isNew: false };

  const created = await client.query<UserRow>(
    `insert into users (email, name, role) values ($1, $2, $3)
     returning id, email, name, role, created_at`,
    [email, name ?? null, role ?? 'patient'],
  );
  const user = created.rows[0]!;

  await seedTags(client, user.id);

  // A patient may have invited this address before it had an account. Claim those
  // invitations now so the doctor sees them the moment they first sign in.
  await client.query(
    `update shares set doctor_id = $1 where doctor_email = $2 and doctor_id is null`,
    [user.id, user.email],
  );

  return { user, isNew: true };
}

export async function requestLogin(input: {
  email: string;
  name?: string;
  role?: UserRole;
  ip?: string;
}): Promise<void> {
  const { token, code, isNew, email } = await transaction(async (client) => {
    const { user, isNew } = await findOrCreateUser(client, input.email, input.name, input.role);

    const recent = await client.query<{ count: number }>(
      `select count(*)::int as count from magic_links
       where user_id = $1 and created_at > now() - interval '1 hour'`,
      [user.id],
    );
    if ((recent.rows[0]?.count ?? 0) >= MAX_LINKS_PER_HOUR) {
      throw new ApiError(429, 'too_many_requests', 'Too many sign-in emails. Try again shortly.');
    }

    // Any earlier unused link for this person stops working the moment a new one
    // is issued, so a forwarded old email cannot be used later.
    await client.query(
      `update magic_links set consumed_at = now()
       where user_id = $1 and consumed_at is null`,
      [user.id],
    );

    const token = generateToken();
    const code = generateCode();
    await client.query(
      `insert into magic_links (user_id, token_hash, code_hash, expires_at, requested_ip)
       values ($1, $2, $3, now() + make_interval(mins => $4), $5)`,
      [user.id, hashToken(token), hashToken(code), config.MAGIC_LINK_TTL_MINUTES, input.ip ?? null],
    );

    return { token, code, isNew, email: user.email };
  });

  await mailer.send(buildLoginEmail(email, token, code, isNew));
}

async function createSession(
  client: PoolClient,
  userId: string,
  userAgent?: string,
): Promise<string> {
  const sessionToken = generateToken();
  await client.query(
    `insert into sessions (user_id, token_hash, expires_at, user_agent)
     values ($1, $2, now() + make_interval(days => $3), $4)`,
    [userId, hashToken(sessionToken), config.SESSION_TTL_DAYS, userAgent?.slice(0, 500) ?? null],
  );
  await client.query('update users set last_login_at = now() where id = $1', [userId]);
  return sessionToken;
}

/** Consumes a link token (from the email button) and returns a session. */
export async function verifyLinkToken(
  token: string,
  userAgent?: string,
): Promise<{ user: User; sessionToken: string }> {
  return transaction(async (client) => {
    const found = await client.query<{ id: string; user_id: string }>(
      `select id, user_id from magic_links
       where token_hash = $1 and consumed_at is null and expires_at > now()
       for update`,
      [hashToken(token)],
    );
    const link = found.rows[0];
    if (!link) throw ApiError.unauthorized('That sign-in link has expired or was already used.');

    await client.query('update magic_links set consumed_at = now() where id = $1', [link.id]);
    return finishLogin(client, link.user_id, userAgent);
  });
}

/** Consumes a six-digit code typed into the app. */
export async function verifyCode(
  email: string,
  code: string,
  userAgent?: string,
): Promise<{ user: User; sessionToken: string }> {
  return transaction(async (client) => {
    const found = await client.query<{ id: string; user_id: string; attempts: number }>(
      `select ml.id, ml.user_id, ml.attempts
       from magic_links ml
       join users u on u.id = ml.user_id
       where u.email = $1 and ml.consumed_at is null and ml.expires_at > now()
       order by ml.created_at desc
       limit 1
       for update of ml`,
      [email],
    );
    const link = found.rows[0];
    if (!link) throw ApiError.unauthorized('That code has expired. Request a new one.');

    if (link.attempts >= MAX_CODE_ATTEMPTS) {
      // Burn the link rather than leaving a guessable credential alive.
      await client.query('update magic_links set consumed_at = now() where id = $1', [link.id]);
      throw ApiError.unauthorized('Too many incorrect attempts. Request a new code.');
    }

    const matches = await client.query<{ ok: boolean }>(
      'select (code_hash = $2) as ok from magic_links where id = $1',
      [link.id, hashToken(code)],
    );
    if (!matches.rows[0]?.ok) {
      await client.query('update magic_links set attempts = attempts + 1 where id = $1', [link.id]);
      throw ApiError.unauthorized('That code is not right.');
    }

    await client.query('update magic_links set consumed_at = now() where id = $1', [link.id]);
    return finishLogin(client, link.user_id, userAgent);
  });
}

async function finishLogin(
  client: PoolClient,
  userId: string,
  userAgent?: string,
): Promise<{ user: User; sessionToken: string }> {
  const sessionToken = await createSession(client, userId, userAgent);
  const userRow = await client.query<UserRow>(
    'select id, email, name, role, created_at from users where id = $1',
    [userId],
  );
  return { user: toUser(userRow.rows[0]!), sessionToken };
}

/** Resolves a session token to its user, refreshing last_seen_at. */
export async function resolveSession(sessionToken: string): Promise<User | null> {
  // The expiry moves forward on every use, so the window is measured from the
  // last time the app was opened rather than from when you first signed in.
  const { rows } = await query<UserRow>(
    `with touched as (
       update sessions
       set last_seen_at = now(),
           expires_at = now() + make_interval(days => $2)
       where token_hash = $1 and expires_at > now()
       returning user_id
     )
     select u.id, u.email, u.name, u.role, u.created_at
     from touched join users u on u.id = touched.user_id`,
    [hashToken(sessionToken), config.SESSION_TTL_DAYS],
  );
  const row = rows[0];
  return row ? toUser(row) : null;
}

export async function logout(sessionToken: string): Promise<void> {
  await query('delete from sessions where token_hash = $1', [hashToken(sessionToken)]);
}

export async function updateProfile(userId: string, name: string): Promise<User> {
  const { rows } = await query<UserRow>(
    'update users set name = $2 where id = $1 returning id, email, name, role, created_at',
    [userId, name],
  );
  if (!rows[0]) throw ApiError.notFound('User not found');
  return toUser(rows[0]);
}

/** Housekeeping - safe to call on a schedule or at boot. */
export async function purgeExpired(): Promise<void> {
  await query('delete from sessions where expires_at < now()');
  await query(`delete from magic_links where expires_at < now() - interval '7 days'`);
}
