#!/usr/bin/env bash
#
# Deploys the API to Cloud Run.
#
#   ./deploy/deploy.sh staging
#   ./deploy/deploy.sh prod
#
# The two client apps are not in this image - they go to Firebase Hosting:
#
#   npm run deploy:hosting
#
# Deploying never touches the database. Schema changes are applied separately and
# deliberately with `npm run db:plan` then `npm run db:apply`.

set -euo pipefail

ENVIRONMENT="${1:-}"
if [[ "$ENVIRONMENT" != "staging" && "$ENVIRONMENT" != "prod" ]]; then
  echo "usage: $0 staging|prod" >&2
  exit 2
fi

PROJECT="${GCP_PROJECT:-measure-pressure-app}"
REGION="${GCP_REGION:-us-central1}"
REPO="${ARTIFACT_REPO:-measure-pressure}"
if [[ "$ENVIRONMENT" == "prod" ]]; then
  SERVICE="measure-pressure-api"
else
  SERVICE="measure-pressure-api-staging"
fi

# Where Firebase serves the apps from. Used for the link in the login email.
WEB_ORIGIN="${WEB_ORIGIN:-https://measure-pressure-app.web.app}"

# Who the sign-in emails come from.
#
# onboarding@resend.dev is Resend's sandbox sender: it only delivers to the address
# the Resend account was registered with, and returns 403 for anyone else. That is
# fine while you are the only user and useless the moment you invite someone.
#
# To send to anyone else, verify a domain in Resend and set this. Use a SUBDOMAIN -
# mail.kupfer.co rather than kupfer.co - so its SPF and DKIM records cannot
# interfere with the mail already running on the apex.
MAIL_FROM="${MAIL_FROM:-Measure Pressure <noreply@kupfer.co>}"

IMAGE="${REGION}-docker.pkg.dev/${PROJECT}/${REPO}/api"
TAG="$(git rev-parse --short HEAD)$(git diff --quiet || echo '-dirty')"

echo "→ ${SERVICE} · ${PROJECT}/${REGION} · tag ${TAG}"
echo "  database: Neon (from the measure-pressure-database-url secret)"
echo "  origin:   ${WEB_ORIGIN}"

# Cloud Build rather than a local docker push: the image is built on the same
# architecture Cloud Run runs, which an Apple Silicon laptop is not.
gcloud builds submit \
  --project "${PROJECT}" \
  --region "${REGION}" \
  --config deploy/cloudbuild.yaml \
  --substitutions "_IMAGE=${IMAGE},_TAG=${TAG}" \
  .

# Email is optional at deploy time. Without a Resend key the service still runs and
# still works - it prints sign-in codes to the Cloud Run log instead of emailing
# them - which is enough to prove a deployment before the key exists. It is not
# enough for anyone else to log in, so the script says so loudly.
if gcloud secrets describe measure-pressure-resend-key --project "${PROJECT}" >/dev/null 2>&1; then
  MAIL_TRANSPORT=resend
  SECRETS="DATABASE_URL=measure-pressure-database-url:latest,RESEND_API_KEY=measure-pressure-resend-key:latest"
else
  MAIL_TRANSPORT=console
  SECRETS="DATABASE_URL=measure-pressure-database-url:latest"
  echo
  echo "  ! No measure-pressure-resend-key secret, so email is disabled."
  echo "    Sign-in codes will go to the Cloud Run log instead:"
  echo "      gcloud beta run services logs tail ${SERVICE} --project ${PROJECT} --region ${REGION}"
  echo "    Only you can read those, so nobody else can sign in until the key exists."
  echo
fi

gcloud run deploy "${SERVICE}" \
  --project "${PROJECT}" \
  --region "${REGION}" \
  --image "${IMAGE}:${TAG}" \
  --platform managed \
  --allow-unauthenticated \
  --set-env-vars "APP_ENV=${ENVIRONMENT},GOOGLE_CLOUD_PROJECT=${PROJECT},MAIL_TRANSPORT=${MAIL_TRANSPORT},WEB_ORIGIN=${WEB_ORIGIN},MAIL_FROM=${MAIL_FROM},GCS_BUCKET=${PROJECT}-scans" \
  --set-secrets "${SECRETS}" \
  --min-instances 0 \
  --max-instances 2 \
  --memory 512Mi \
  --cpu 1 \
  --concurrency 40 \
  --timeout 60s

URL="$(gcloud run services describe "${SERVICE}" --project "${PROJECT}" --region "${REGION}" --format='value(status.url)')"
echo
echo "✓ API deployed: ${URL}"
echo "  the apps reach it through ${WEB_ORIGIN}/api"
