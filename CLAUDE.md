# Measure Pressure

A personal blood-pressure tracker. Photograph an Omron monitor, confirm the numbers,
add context, and over time see what moves the readings. Real users: three - Daniel,
his father, and his doctor. Not a product, and not intended to become one.

## Working with Daniel

- **Never commit or push unless he asks in that message.** Do the work, say what
  changed, stop. An earlier "commit and push" does not authorise the next one.
- **Be brief.** He has asked for this more than once. Short sentences, no preamble,
  no restating what he just said.
- **Check before inferring.** Several bugs in this repo's history came from acting
  on a plausible assumption instead of running one command to find out. If a
  database, a log or an API can answer the question, ask it.
- He pushes back well and is usually right. When he is, say so plainly and change
  course - do not defend the original.

## Layout

```
apps/api/          Fastify + Postgres. Auth, readings, tags, scans, reports, sharing
apps/app/          Expo (React Native). The patient, on iOS and the web
apps/doctor/       Vite + React. The clinician, web only
packages/shared/   Domain rules and API contracts used by all three
db/schema/         Declarative schema - what the database should look like
deploy/            Dockerfile, Cloud Build, deploy script, SETUP.md
docs/architecture.md   Every decision and what it cost
```

Two clients on purpose: the patient photographs a monitor one-handed at 7am, the
clinician reads a table on a desktop. Tables are the one thing React Native Web
cannot do well, which is what decided it.

## Commands

```sh
npm run dev:api          # API on :8080
npm run dev:app          # Expo - press w for web, or scan with Expo Go
npm run dev:doctor       # clinician app on :5174, proxies /api to :8080

npm test                 # parser + statistics + diary bucketing
npm run typecheck

npm run db:plan          # read-only diff against the live database
npm run db:apply         # apply it, after showing the plan and asking

npm run deploy:api:prod  # Cloud Run
npm run deploy:hosting   # both client apps to Firebase Hosting
```

## Things that will bite you

- **The schema is declarative.** Edit `db/schema/*.sql` to describe the end state;
  Atlas works out the diff. Do not write migrations. Deleting a column from the
  file plans a `DROP COLUMN`.
- **One Neon database** behind local, staging and production. `npm run db:apply`
  from a laptop is a production change. `docker compose up db` gives a throwaway
  Postgres for trying something first.
- **The session cookie must be called `__session`.** Firebase Hosting strips every
  other cookie from requests it forwards to Cloud Run. Renaming it breaks the
  clinician app silently - the API just sees an anonymous request.
- **`/healthz` is unreachable** on run.app domains; Google's frontend answers it.
  The health endpoint is `/health` and `/api/health`.
- **React is pinned exactly** across `apps/app` and `apps/doctor`. A caret range
  lets npm nest a second copy, which breaks every hook with "Invalid hook call"
  while blaming your components.
- **Readings taken within 10 minutes share a `session_id`** - one sitting. Reports
  work from each sitting's mean, so a day measured three times does not outvote a
  day measured once. Every individual reading is still kept and shown.
- **Resend sends from `noreply@kupfer.co`**, a verified domain. The sandbox sender
  `onboarding@resend.dev` only delivers to the account owner.

## The capture flow, which is the whole app

```
camera -> upload -> Cloud Vision -> Omron parser -> CONFIRM -> save
                                                       ^
                                       always shown, never skipped
```

`apps/api/src/modules/scans/omron-parser.ts` reconstructs the display from
bounding-box geometry rather than trusting Vision's reading order: Omron stacks
SYS/DIA/PULSE vertically in larger type than the clock.

**Everything geometric depends on knowing which way up the photo was.** A phone
writes its sensor's landscape pixels and puts the rotation in an EXIF tag; Cloud
Vision reads the pixels and ignores the tag. A portrait photo - which is how you
hold a phone over a monitor on a table - therefore arrives with the display on its
side, and "above", "below" and "taller than" are all ninety degrees out. The parser
recovers the rotation from Vision's own word polygons, whose corners come back in
reading order, and turns every box upright before it reads anything. This is the
first thing to check if a capture comes out wrong: `evidence.quarterTurns`.

Vision reads these displays better than you would expect - the digits are usually
right. When a scan is wrong, suspect the parser, not the OCR. Confirm it:

```sh
npm run scan:check -- photo.jpg    # Vision + parse, one photo
npm run scan:check -- --stored     # replay every stored capture, no network
```

Every scan keeps its raw Vision response in `scans.vision_raw`, so `--stored` is a
free regression run over real history. `omron-parser.test.ts` has one fixture taken
from an actual capture; the rest of the tests are synthetic and once passed happily
while the feature failed on every real photograph.

A failed scan falls back to manual entry and looks the same whether Vision
errored, returned nothing, or was never called. Check the logs before assuming
which.

## Deployed

```
https://measure-pressure-app.web.app          patient
https://measure-pressure-app.web.app/doctor   clinician
https://measure-pressure-app.web.app/api/*    rewritten to Cloud Run
```

GCP project `measure-pressure-app` (not `lv-notas`, which runs other work).
Database is Neon, deliberately outside GCP so nothing here can affect it.
