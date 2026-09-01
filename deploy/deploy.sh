#!/usr/bin/env bash
#
# Build and deploy to Cloud Run.
#
#   ./deploy/deploy.sh staging
#   ./deploy/deploy.sh prod
#
# Both environments run the same image against the same database - the only thing
# that differs is the service name and a couple of environment variables. See
# docs/architecture.md for why there is one database rather than three.

set -euo pipefail

ENVIRONMENT="${1:-}"
if [[ "$ENVIRONMENT" != "staging" && "$ENVIRONMENT" != "prod" ]]; then
  echo "usage: $0 staging|prod" >&2
  exit 2
fi

# ---------------------------------------------------------------- settings
PROJECT="${GCP_PROJECT:-lv-notas}"
REGION="${GCP_REGION:-us-central1}"
REPO="${ARTIFACT_REPO:-measure-pressure}"
SERVICE="measure-pressure-${ENVIRONMENT}"
SQL_INSTANCE="${CLOUDSQL_INSTANCE:?set CLOUDSQL_INSTANCE to PROJECT:REGION:INSTANCE}"

IMAGE="${REGION}-docker.pkg.dev/${PROJECT}/${REPO}/api"
TAG="$(git rev-parse --short HEAD)$(git diff --quiet || echo '-dirty')"

echo "→ project ${PROJECT} · region ${REGION} · service ${SERVICE} · tag ${TAG}"

# ---------------------------------------------------------------- build
# Cloud Build rather than a local docker push: the image is built on the same
# architecture Cloud Run runs, which an Apple Silicon laptop is not.
gcloud builds submit \
  --project "${PROJECT}" \
  --region "${REGION}" \
  --config deploy/cloudbuild.yaml \
  --substitutions "_IMAGE=${IMAGE},_TAG=${TAG}" \
  .

# ---------------------------------------------------------------- deploy
gcloud run deploy "${SERVICE}" \
  --project "${PROJECT}" \
  --region "${REGION}" \
  --image "${IMAGE}:${TAG}" \
  --platform managed \
  --allow-unauthenticated \
  --add-cloudsql-instances "${SQL_INSTANCE}" \
  --set-env-vars "APP_ENV=${ENVIRONMENT},GOOGLE_CLOUD_PROJECT=${PROJECT},MAIL_TRANSPORT=resend" \
  --set-secrets "DATABASE_URL=measure-pressure-database-url:latest,RESEND_API_KEY=measure-pressure-resend-key:latest" \
  --min-instances 0 \
  --max-instances 2 \
  --memory 512Mi \
  --cpu 1 \
  --concurrency 40 \
  --timeout 60s

URL="$(gcloud run services describe "${SERVICE}" --project "${PROJECT}" --region "${REGION}" --format='value(status.url)')"

# WEB_ORIGIN has to be the service's own URL, which is not known until the service
# exists. Set it on a second pass rather than hard-coding a guess.
gcloud run services update "${SERVICE}" \
  --project "${PROJECT}" \
  --region "${REGION}" \
  --update-env-vars "WEB_ORIGIN=${URL}" \
  --quiet

echo
echo "✓ deployed: ${URL}"
echo
echo "If the schema changed, apply it separately - deploying does not touch the database:"
echo "  DATABASE_URL=... npm run db:apply"
