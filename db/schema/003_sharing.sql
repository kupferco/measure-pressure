-- Doctor access, and the record of it being used.

create type share_status as enum ('pending', 'active', 'revoked');

-- Invitations are addressed by email so a patient can invite a doctor who has no
-- account yet; doctor_id is filled in when that address signs up.
create table shares (
  id           uuid primary key default gen_random_uuid(),
  patient_id   uuid not null references users (id) on delete cascade,
  doctor_email text not null,  -- lower-cased at the boundary, like users.email
  doctor_id    uuid references users (id) on delete set null,
  status       share_status not null default 'pending',
  note         text,
  created_at   timestamptz not null default now(),
  responded_at timestamptz,
  revoked_at   timestamptz,
  unique (patient_id, doctor_email)
);
create index shares_doctor_idx on shares (doctor_id) where status = 'active';
create index shares_doctor_email_idx on shares (doctor_email) where status = 'pending';

-- Health data: keep a record of every time someone reads someone else's readings.
create table access_log (
  id         bigserial primary key,
  actor_id   uuid not null references users (id) on delete cascade,
  subject_id uuid not null references users (id) on delete cascade,
  action     text not null,
  detail     jsonb,
  created_at timestamptz not null default now()
);
create index access_log_subject_idx on access_log (subject_id, created_at desc);
