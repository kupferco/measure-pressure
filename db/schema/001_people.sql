-- Accounts and how people sign in.
--
-- These files DECLARE the shape the database should have. They are not change
-- scripts: nothing here says "add" or "alter". Edit a table to look how you want
-- it to look, run `npm run db:plan`, and the diff against the live database is
-- worked out for you.

create type user_role as enum ('patient', 'doctor');

-- Emails are stored lower-cased. That is enforced at every entry point by the
-- shared `emailSchema` (zod `.toLowerCase()`), which is why a plain unique column
-- is enough and the citext extension is not needed.
create table users (
  id            uuid primary key default gen_random_uuid(),
  email         text not null unique,
  name          text,
  role          user_role not null default 'patient',
  created_at    timestamptz not null default now(),
  last_login_at timestamptz
);

-- Passwordless login. Only hashes are stored, so a database leak does not hand
-- anyone a working login link.
--
-- Each request issues two credentials for the same login: a long token in a
-- clickable link (for the browser) and a short numeric code (for typing into the
-- app). The code exists because deep-linking an email into an iOS app needs
-- Universal Links and an apple-app-site-association file; six digits needs neither.
-- Because six digits is guessable, codes are short-lived and attempts are counted.
create table magic_links (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references users (id) on delete cascade,
  token_hash   bytea not null unique,
  code_hash    bytea not null,
  attempts     smallint not null default 0,
  expires_at   timestamptz not null,
  consumed_at  timestamptz,
  requested_ip inet,
  created_at   timestamptz not null default now()
);
create index magic_links_user_idx on magic_links (user_id, created_at desc);
create index magic_links_expiry_idx on magic_links (expires_at) where consumed_at is null;

create table sessions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references users (id) on delete cascade,
  token_hash   bytea not null unique,
  expires_at   timestamptz not null,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  user_agent   text
);
create index sessions_user_idx on sessions (user_id);
create index sessions_expiry_idx on sessions (expires_at);
