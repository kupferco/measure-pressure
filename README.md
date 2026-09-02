# Measure Pressure

Photograph the blood pressure monitor, check the numbers, add a line about what was
going on. Over time, see what actually moves the readings.

A personal app for tracking my own blood pressure, and my father's. Not a product.

## What it does

- **Opens on the camera.** Point it at the Omron display, take the shot. In a mobile
  browser it hands off to the phone's own camera app; in the native build it has its
  own viewfinder.
- **Reads the numbers** with Cloud Vision and a parser that knows how these monitors
  are laid out - then always asks you to confirm, because seven-segment digits are
  exactly what OCR gets wrong.
- **Keeps the context.** A free-text note for what was going on, plus optional
  one-tap tags you can rename and add to.
- **Shows the trend** - systolic and diastolic over time, banded by category, split
  by time of day.
- **Compares** readings you tagged against the rest, so "does sleeping badly
  actually matter?" gets an arithmetic answer rather than a guess.
- **Shares with your doctor**, read-only, revocable, and logged. They get their own
  app: a light, printable blood-pressure diary - one row per day, one column per
  part of the day.

## Running it

```sh
npm install
cp .env.example .env          # then set DATABASE_URL

npm run db:plan               # see what the schema change would do
npm run db:apply              # apply it

npm run dev:api               # API on :8080
npm run dev:app               # Expo - scan the QR with Expo Go, or press w for the browser
npm run dev:doctor            # the clinician app on :5174
```

No email account needed locally: `MAIL_TRANSPORT=console` prints your sign-in code
to the API log.

**Expo Go on a real phone** works without any extra setup - the app finds the API on
your machine's network address automatically, so `localhost` never has to resolve
from the phone.

If you would rather not point local development at the real database, there is a
throwaway one:

```sh
npm run db:up                 # Postgres in Docker on :55432
```

## Layout

```
apps/api/          Fastify API - auth, readings, tags, scans, reports, sharing
apps/app/          Expo app - the patient, on iOS and the web
apps/doctor/       Vite + React - the clinician, web only
packages/shared/   Domain rules and API contracts used by both
db/schema/         Declarative schema - what the database should look like
deploy/            Dockerfile, Cloud Build, deploy script, one-time GCP setup
docs/              Why things are the way they are
```

## Changing the schema

The schema is **declarative**. `db/schema/*.sql` describes what the database should
look like - not how to get there. Edit it to describe the end state you want, then:

```sh
npm run db:plan     # the diff against the live database. Read-only.
npm run db:apply    # apply it, after showing the plan and asking
npm run db:inspect  # what the live database looks like right now
```

[Atlas](https://atlasgo.io) derives the changes. Delete a column from the file and
it plans a `DROP COLUMN`; change a type and it plans the cast. There are no change
scripts to write and nothing to number.

Needs Docker running - Atlas uses a throwaway Postgres to normalise the declared
schema before comparing. That scratch database is never your data.

One database sits behind local, staging and production, so destructive changes
always stop and ask first.

## Tests

```sh
npm test         # parser and statistics
npm run typecheck
```

The two pieces worth testing are the ones that can be quietly wrong: the Omron
display parser, and the statistics behind the impact report.

## Deploying

```sh
./deploy/deploy.sh staging
./deploy/deploy.sh prod
```

One Cloud Run service per environment, each serving both the API and the web build
from a single container. First time through, work through
[`deploy/SETUP.md`](deploy/SETUP.md).

## Reading further

[`docs/architecture.md`](docs/architecture.md) - the decisions and what they cost.

---

Categories follow ACC/AHA thresholds and exist to colour a chart. This app does not
diagnose anything.
