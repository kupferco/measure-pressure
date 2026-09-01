-- The readings themselves, the photos they came from, and the context tags.

create type reading_source as enum ('photo', 'manual');
create type cuff_arm       as enum ('left', 'right', 'unknown');
create type body_posture   as enum ('sitting', 'lying', 'standing', 'unknown');

-- One row per photo, kept even when the user abandons the confirm screen.
-- vision_raw turns real captures into a corpus for improving the parser later.
create table scans (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references users (id) on delete cascade,
  image_object text,
  vision_raw   jsonb,
  parsed       jsonb,
  confidence   real,
  created_at   timestamptz not null default now()
);
create index scans_user_idx on scans (user_id, created_at desc);

create table readings (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references users (id) on delete cascade,
  systolic       smallint not null constraint readings_systolic_range check (systolic between 60 and 260),
  diastolic      smallint not null constraint readings_diastolic_range check (diastolic between 30 and 200),
  pulse          smallint constraint readings_pulse_range check (pulse is null or pulse between 25 and 220),
  measured_at    timestamptz not null,
  note           text constraint readings_note_length check (note is null or length(note) <= 2000),
  arm            cuff_arm not null default 'unknown',
  posture        body_posture not null default 'unknown',
  source         reading_source not null default 'manual',
  scan_id        uuid references scans (id) on delete set null,
  ocr_confidence real,
  ocr_corrected  boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint systolic_above_diastolic check (systolic > diastolic)
);
create index readings_user_measured_idx on readings (user_id, measured_at desc);

-- Tags belong to the user, not to this codebase: renamed, added to and retired
-- from inside the app. Archiving rather than deleting means a reading tagged three
-- years ago keeps its meaning after the tag falls out of use.
create table tags (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users (id) on delete cascade,
  label       text not null constraint tags_label_length check (length(trim(label)) between 1 and 60),
  tag_group   text not null default 'custom',
  sort_order  integer not null default 0,
  archived_at timestamptz,
  created_at  timestamptz not null default now()
);
-- Case-insensitive uniqueness, but only among tags still in use: archiving "Yoga"
-- should not block creating it again later.
create unique index tags_user_label_idx on tags (user_id, lower(label)) where archived_at is null;
create index tags_user_order_idx on tags (user_id, sort_order);

create table reading_tags (
  reading_id uuid not null references readings (id) on delete cascade,
  tag_id     uuid not null references tags (id) on delete cascade,
  primary key (reading_id, tag_id)
);
create index reading_tags_tag_idx on reading_tags (tag_id);
