# Deployment

Two things get deployed, separately:

| | Where | Command |
|---|---|---|
| The API | Cloud Run | `./deploy/deploy.sh staging\|prod` |
| Both client apps | Firebase Hosting | `npm run deploy:hosting` |

Firebase Hosting rewrites `/api/**` to the Cloud Run service, so the browser sees
a single origin. That is what makes the session cookie work across the patient app
at `/` and the clinician app at `/doctor` with no CORS anywhere.

Neither command touches the database. Schema changes are applied on purpose, with
`npm run db:plan` and then `npm run db:apply`.

---

## Its own GCP project

Measure Pressure gets a project of its own rather than sharing `lv-notas`, which
runs other work. Sharing would save nothing - Cloud Run and Vision bill per usage
against the billing account, not per project - and a separate project means its own
IAM, its own Firebase Hosting free tier, and the ability to delete the whole thing
in one action if it is ever abandoned.

Project IDs are globally unique, so `measure-pressure` may be taken; add a suffix
and set `GCP_PROJECT` accordingly if so.

```sh
export PROJECT=measure-pressure
export REGION=us-central1

gcloud projects create "$PROJECT" --name="Measure Pressure"

# Link the billing account you already use. Nothing here is expected to cost
# anything - Cloud Run scales to zero, Hosting has a free tier, and Vision's first
# 1000 images a month are free - but the APIs will not enable without it.
gcloud billing accounts list
gcloud billing projects link "$PROJECT" --billing-account=BILLING_ACCOUNT_ID

gcloud config set project "$PROJECT"
```

Then add Firebase to it, which gives `https://measure-pressure.web.app`:

```sh
firebase projects:addfirebase "$PROJECT"
```

## One-time setup

### 1. APIs

```sh
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com \
  vision.googleapis.com \
  --project "$PROJECT"
```

### 2. Somewhere to put the image

```sh
gcloud artifacts repositories create measure-pressure \
  --repository-format=docker --location="$REGION" \
  --description="Measure Pressure" --project="$PROJECT"
```

### 3. The database (Neon)

One Neon project, used by local development, staging and production alike. The free
plan is permanent, needs no card, and this app sits far inside it - roughly 4
CU-hours a month against 100, and tens of megabytes against 0.5 GB.

Create it at [neon.com](https://neon.com) and put the connection string in `.env`:

```
DATABASE_URL=<whatever Neon shows you>
```

Then create the tables:

```sh
brew install ariga/tap/atlas          # once
npm run db:plan                        # read-only: what it would do
npm run db:apply                       # do it
```

Neon offers two forms of the connection string, pooled and direct. Either works
here - `db:plan` and `db:apply` switch to the direct one themselves, because the
pooled endpoint cannot carry schema changes.

### 4. Secrets

```sh
# The Neon connection string. Cloud Run reads it from here, never from .env.
printf '%s' "$DATABASE_URL" \
  | gcloud secrets create measure-pressure-database-url --data-file=- --project="$PROJECT"

printf 're_your_key_here' \
  | gcloud secrets create measure-pressure-resend-key --data-file=- --project="$PROJECT"
```

Let the Cloud Run service account read them, reach the database, and write photos:

```sh
PROJECT_NUMBER=$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')
SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

for SECRET in measure-pressure-database-url measure-pressure-resend-key; do
  gcloud secrets add-iam-policy-binding "$SECRET" \
    --member="serviceAccount:$SA" --role=roles/secretmanager.secretAccessor --project="$PROJECT"
done

for ROLE in roles/storage.objectAdmin; do
  gcloud projects add-iam-policy-binding "$PROJECT" --member="serviceAccount:$SA" --role="$ROLE"
done
```

Cloud Vision needs no extra role once its API is enabled.

### 5. A bucket for the photos

```sh
gcloud storage buckets create "gs://${PROJECT}-measure-pressure-scans" \
  --location="$REGION" --uniform-bucket-level-access --project="$PROJECT"
```

These are photographs of medical readings. The bucket stays private; the API hands
out signed URLs that expire after an hour. Do not make it public.

Then add `GCS_BUCKET` to the `--set-env-vars` line in `deploy/deploy.sh`.

### 6. Hosting

Nothing to do. Adding Firebase to the project above created the default site, which
is the project id - so the apps land on `https://measure-pressure.web.app`.

### 7. Email

Sign up at [resend.com](https://resend.com), create an API key, and put it in
`.env` as `RESEND_API_KEY`. The setup step above copies it from there into Secret
Manager, so it never has to be pasted anywhere else.

**Verify a domain before inviting anyone.** Until you do, Resend only lets you send
from its sandbox sender `onboarding@resend.dev`, which delivers *only* to the
address the Resend account was registered with and returns 403 for everyone else.
So sign-in works for you and silently fails for your father and your doctor.

Verify a **subdomain**, not the apex - `mail.kupfer.co` rather than `kupfer.co` -
so Resend's SPF and DKIM records cannot interfere with the mail already running on
the domain proper. Resend gives you the DNS records to add; propagation is usually
minutes.

Then redeploy with the new sender:

```sh
MAIL_FROM='Measure Pressure <noreply@mail.kupfer.co>' ./deploy/deploy.sh prod
```

Locally none of this matters: `MAIL_TRANSPORT=console` prints the sign-in code to
the API log.

---

## Deploying

```sh
./deploy/deploy.sh staging     # API
npm run deploy:hosting         # both apps
```

`staging` and `prod` are two Cloud Run services against the same database - see
`docs/architecture.md` for why there is one.

## Checking the hosting rules without deploying

```sh
npm run build:hosting
firebase emulators:start --only hosting     # http://localhost:5010
```

The `/api` rewrite will not resolve locally, but every routing, clean-URL, cache
and security-header rule does.
