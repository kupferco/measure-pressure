# Measure Pressure - architecture & decisions

A personal blood-pressure tracker. Photograph an Omron display, confirm the numbers,
add context, and over time see what actually moves the readings. Expected users: 2-5
(me, my father, my doctor). Explicitly not a product.

---

## Decisions made

| # | Decision | Chosen | Why |
|---|---|---|---|
| 1 | Client | **Expo (React Native) - one codebase, iOS native + web build** | One codebase covers three ways of using it: Expo Go today, a real native build later, and the web build. The doctor always gets the web version. |
| 2 | Auth | **Email magic link, email only** | No passwords to store, hash, reset or leak - which matters for health data. An account is an email address; a name is profile information set later, so the same person cannot arrive under three spellings. |
| 8 | Doctor access | **Derived from sharing, not a role on the account** | Nobody is flagged a doctor. You can read someone's readings because they shared them with you, and the home screen follows from that - so one person can track their own pressure and read their patients'. |
| 3 | OCR | **Google Cloud Vision** | Stays inside GCP. Compensated for with layout-aware parsing and a mandatory confirm screen (see below). |
| 4 | Backend | **Fastify + Postgres** | One container on Cloud Run, serving the API *and* the web build. One service, one URL, no CORS. |
| 5 | Database | **One Cloud SQL Postgres database for local, staging and prod** | Already paid for, and one thing to manage rather than three. |
| 7 | Schema | **Declarative, managed by [Atlas](https://atlasgo.io)** | `db/schema/` declares the shape the database should have. Atlas diffs it against the live database and works out the changes. No versioned migrations, no change scripts. |
| 6 | Context capture | **Free-text note (primary) + editable per-user tags (secondary, collapsed by default)** | The note is what you actually want to write and can be analysed by an LLM later. Tags are structured, so they can be averaged - which is what makes the "what affects my pressure" report arithmetic rather than vibes. |

### Consequences worth remembering

- **How it actually gets used today:** Expo Go on the phone, and the web build in
  mobile Safari. Neither needs an Apple Developer account.
- **A native build needs $99/yr** (Apple Developer Program) whenever that becomes
  worth doing. Installing over USB to your own device is enough - TestFlight is only
  for handing builds to other people.
- **The doctor is always on the web build.** Nothing about the native path affects
  them, which is why the web build is not a second-class target here.
- **React Native Web** means the charts are built from `react-native-svg` rather
  than a web charting library.
- **Capture works differently on the two.** Native uses an in-app viewfinder; the
  web build hands off to the phone's own camera app through a file input. Same
  camera, same resolution - see `src/lib/capture.ts` for why that is the better
  choice in a browser rather than a compromise.

---

## The capture flow

This is the feature everything else serves. The app **opens directly on the camera**;
the dashboard sits behind a small icon.

```
camera  ->  upload  ->  Cloud Vision  ->  Omron parser  ->  CONFIRM  ->  save
                                                              ^
                                              always shown, never skipped
```

**Why the confirm screen is not optional.** Cloud Vision is trained on printed and
handwritten text; seven-segment LCD digits are close to its worst case. `8` reads as
`0` or `6`, `1` gets dropped entirely, glare erases a segment. The parser below
raises accuracy but cannot guarantee it, and a silently wrong blood-pressure record
is worse than no record. So the numbers always arrive as three big, pre-filled,
editable fields. One tap accepts them.

**How the parser works.** Omron units stack their three values vertically in a fixed
order - SYS on top, DIA below it, PULSE at the bottom - and label them. So rather
than trusting Vision's reading order, the parser:

1. takes every numeric token Vision found, with its bounding box
2. sorts them by vertical position
3. anchors on the `SYS` / `DIA` / `PULSE` labels when they were legible
4. range-checks each candidate (systolic 60-260, diastolic 30-200, pulse 25-220)
5. sanity-checks the pair (systolic must exceed diastolic)
6. emits a confidence score and human-readable warnings for the confirm screen

Every scan is stored with its **raw Vision response** in `scans.vision_raw`. That
turns real Omron photos into a regression corpus, so the parser can be improved
later against actual failures rather than guesses. When a user edits a number the
OCR proposed, `readings.ocr_corrected` records it - a free, honest accuracy metric.

---

## Data model

Declared across [`db/schema/`](../db/schema/), by area.

- `users` - an email address and an optional name. Deliberately no role column
- `magic_links`, `sessions` - passwordless auth; only **hashes** of tokens are
  stored, so a database leak does not yield working credentials
- `scans` - one row per photo, kept even if the user abandons the confirm screen
- `readings` - the numbers, timestamp, note, arm, posture, provenance
- `tags` + `reading_tags` - per-user, editable, **archived rather than deleted** so a
  reading tagged years ago keeps its meaning after a rename
- `shares` - doctor access, invited by email so the doctor need not exist yet. An
  active row here is the *only* thing that makes someone a doctor
- `access_log` - every time one person reads another's readings

---

## Reports

Secondary to capture, but the reason the app exists.

- **Trend** - systolic/diastolic over time, banded by ACC/AHA category
- **Time of day** - the morning vs evening split doctors ask about
- **Impact** - for each tag, mean systolic when tagged vs untagged, with a Welch
  t-test. Only labelled "confident" when there is enough data to justify it.
  Presented as association, never causation.

---

## Environments

| Env | Runs where | Database |
|---|---|---|
| local | laptop | the shared Cloud SQL database |
| staging | Cloud Run | the shared Cloud SQL database |
| prod | Cloud Run | the shared Cloud SQL database |

One database behind all three, deliberately: fewer moving parts to manage, and at
this size there is no meaningful staging traffic to isolate. `docker compose up db`
gives a throwaway local Postgres for trying a schema change out first, which is
worth doing before pointing `db:apply` at the real one.

**What this costs, so it is written down somewhere.** There is no environment where
a mistake is harmless. Two guards exist because of that: `db:apply` prints the
target database and asks for confirmation before doing anything, and the schema file
is additive-only by construction. Neither protects against `delete from readings`.

### Changing the schema

The schema is **declarative**. `db/schema/*.sql` says what the database should look
like - plain `create table` statements, no `if not exists`, no `alter`. To change
something, edit the declaration to describe the end state you want:

```sh
npm run db:plan     # show the diff against the live database, change nothing
npm run db:apply    # apply it, after printing the plan and asking
npm run db:inspect  # dump what the live database currently looks like
```

Atlas inspects the live database, compares it with the declaration, and derives the
statements. Deleting a column from the file plans a `DROP COLUMN`; changing a type
plans the cast. None of that can be expressed by a hand-written idempotent script,
which is exactly why this is not one.

Two guard rails, because every environment shares one database:

- **Destructive changes are never applied without an explicit approval prompt.**
  `--auto-approve` exists but is deliberately not in any npm script.
- **Always run `db:plan` first.** It is a read-only diff and it is the whole point
  of working this way.

Atlas needs Docker running: it spins up a throwaway Postgres to normalise the
declared schema before comparing. That scratch database is never your data.

## Deployment

One Cloud Run service per environment. Each container holds the API and the Expo
web export together, and Fastify serves the static files with a fallback to
`index.html` so the router's deep links survive a refresh.

That is one service rather than two on purpose. A separate static host would mean a
second deploy pipeline, a second URL, and CORS between them - all for a web app with
one user who is not on a phone. Serving them together makes the web build's API
calls same-origin, which is also why it needs no configured API URL at all.

The native app is the exception: it has no origin to be same as, so
`EXPO_PUBLIC_API_URL` must point at the Cloud Run URL when building with EAS.

| | Where | Notes |
|---|---|---|
| Image | Artifact Registry | Built by Cloud Build, not locally - Cloud Run is amd64, the laptop is not |
| Secrets | Secret Manager | `DATABASE_URL`, `RESEND_API_KEY`; never in the image |
| Photos | Cloud Storage, private | Signed URLs expiring after an hour; these are medical images |
| Scaling | 0 to 2 instances | Scales to zero, so an idle environment costs nothing |

Deploying never touches the database. Schema changes are applied separately and
deliberately, with `npm run db:plan` then `npm run db:apply`.

## Repository layout

```
apps/api/          Fastify API - auth, readings, tags, scans, reports, sharing
apps/app/          Expo app - iOS native + web build
packages/shared/   Domain rules and API contracts used by both
db/schema/         Declarative schema - what the database should look like
deploy/            Dockerfile, Cloud Build, deploy script, one-time GCP setup
docs/              This file
```

`packages/shared` is what makes one API and one client agree on the same types:
blood-pressure validation ranges, category thresholds, and every request/response
shape as a zod schema.

---

## Deliberately not doing

- No design system. Plain, legible, large touch targets.
- No ORM. Plain SQL against a small, stable schema.
- No revenue, analytics, or growth machinery.
- No diagnosis. Categories colour a chart and start a conversation with a doctor.
