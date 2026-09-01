# One-time GCP setup

Everything here is done once. After that, `./deploy/deploy.sh staging|prod` is the
whole deployment story.

Values assumed below - override with the environment variables named in
`deploy.sh` if yours differ:

```sh
export PROJECT=lv-notas
export REGION=us-central1
export SQL_INSTANCE=…          # the instance you already pay for
export CLOUDSQL_INSTANCE=$PROJECT:$REGION:$SQL_INSTANCE
```

## 1. Enable the APIs

```sh
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  sqladmin.googleapis.com \
  secretmanager.googleapis.com \
  vision.googleapis.com \
  --project "$PROJECT"
```

## 2. Somewhere to put the image

```sh
gcloud artifacts repositories create measure-pressure \
  --repository-format=docker \
  --location="$REGION" \
  --description="Measure Pressure" \
  --project="$PROJECT"
```

## 3. The database

One database serves local, staging and prod - see `docs/architecture.md`.

```sh
gcloud sql databases create measure_pressure \
  --instance="$SQL_INSTANCE" --project="$PROJECT"

# A user for the app rather than reusing postgres.
gcloud sql users create measure_app \
  --instance="$SQL_INSTANCE" \
  --password="$(openssl rand -base64 24)" \
  --project="$PROJECT"
```

Then create the schema. From your laptop, with the Cloud SQL Auth Proxy running:

```sh
brew install ariga/tap/atlas            # once
cloud-sql-proxy "$CLOUDSQL_INSTANCE" &

export DATABASE_URL='postgres://measure_app:PASSWORD@127.0.0.1:5432/measure_pressure?sslmode=disable'
npm run db:plan                          # read-only: what would change
npm run db:apply                         # apply it
```

## 4. Secrets

Cloud Run reads both of these at start-up; neither is ever committed.

```sh
# Note the socket form of the host - this is how Cloud Run reaches Cloud SQL.
printf 'postgresql://measure_app:PASSWORD@/measure_pressure?host=/cloudsql/%s' "$CLOUDSQL_INSTANCE" \
  | gcloud secrets create measure-pressure-database-url --data-file=- --project="$PROJECT"

printf 're_your_key_here' \
  | gcloud secrets create measure-pressure-resend-key --data-file=- --project="$PROJECT"
```

Let the Cloud Run service account read them and reach the database:

```sh
PROJECT_NUMBER=$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')
SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

for SECRET in measure-pressure-database-url measure-pressure-resend-key; do
  gcloud secrets add-iam-policy-binding "$SECRET" \
    --member="serviceAccount:$SA" --role=roles/secretmanager.secretAccessor \
    --project="$PROJECT"
done

for ROLE in roles/cloudsql.client roles/storage.objectAdmin; do
  gcloud projects add-iam-policy-binding "$PROJECT" \
    --member="serviceAccount:$SA" --role="$ROLE"
done
```

Cloud Vision needs no extra role: the default compute service account can already
call it once the API is enabled.

## 5. A bucket for the photos

```sh
gcloud storage buckets create "gs://${PROJECT}-measure-pressure-scans" \
  --location="$REGION" \
  --uniform-bucket-level-access \
  --project="$PROJECT"
```

These are photographs of medical readings. The bucket stays private - the API hands
out signed URLs that expire after an hour. Do not make it public.

Then add `GCS_BUCKET` to the deploy script's `--set-env-vars`.

## 6. Email

Sign up at [resend.com](https://resend.com) (the free tier is far more than this
app needs), create an API key, and put it in the secret above. Until a domain is
verified, Resend only delivers to your own address - fine for you, but your doctor
will not receive an invitation until you verify one.

Locally none of this is needed: `MAIL_TRANSPORT=console` prints the login code
straight to the server log.

## 7. Deploy

```sh
CLOUDSQL_INSTANCE="$CLOUDSQL_INSTANCE" ./deploy/deploy.sh staging
```

## The iPhone app

Three ways in, in the order you are likely to want them:

**1. The web build - nothing more to do.** It is served by the same Cloud Run
service, so the deploy above already gives you a working app in Safari. On the
phone, open the URL and Share → Add to Home Screen: it then launches fullscreen with
no browser bar, and the camera button opens the phone's own camera app. This is what
your doctor uses, always.

**2. Expo Go, for development.** `npm run dev:app`, scan the QR code. No Apple
account, no Xcode. The app finds your machine's API automatically.

**3. A native build,** whenever it becomes worth it. Needs an Apple Developer
account ($99/yr) and Xcode:

```sh
npm install -g eas-cli
cd apps/app
eas build --platform ios --profile preview
```

Set `EXPO_PUBLIC_API_URL` to the Cloud Run URL in `eas.json` first - unlike the web
build, a native app has no origin to default to. Installing the result over USB to
your own device needs nothing further; TestFlight only matters for handing builds to
other people.
