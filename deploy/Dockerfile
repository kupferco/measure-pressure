# The API, and only the API.
#
# The two client builds are served by Firebase Hosting, which rewrites /api back
# to this service - so the browser sees one origin, the session cookie works, and
# this image stays small enough to deploy quickly.

# ---------------------------------------------------------------- build
FROM node:22-alpine AS build
WORKDIR /app

# Manifests first, so a change to source code does not invalidate the install layer.
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
# npm ci checks the lockfile against every workspace, so the client manifests have
# to be here even though neither client is built into this image.
COPY apps/app/package.json apps/app/
COPY apps/doctor/package.json apps/doctor/
RUN npm ci

COPY . .

RUN npm run build --workspace=@mp/shared \
 && npm run build --workspace=@mp/api

# ---------------------------------------------------------------- runtime deps
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/app/package.json apps/app/
COPY apps/doctor/package.json apps/doctor/
# Only the API's production dependencies reach the final image.
RUN npm ci --omit=dev --workspace=@mp/api --workspace=@mp/shared --include-workspace-root

# ---------------------------------------------------------------- runtime
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=deps  /app/node_modules            ./node_modules
COPY --from=build /app/packages/shared/dist    ./packages/shared/dist
COPY --from=build /app/packages/shared/package.json ./packages/shared/
COPY --from=build /app/apps/api/dist           ./apps/api/dist
COPY --from=build /app/apps/api/package.json   ./apps/api/

# Cloud Run sets PORT; the app reads it.
ENV PORT=8080
EXPOSE 8080

# Never run as root, even for a three-user app.
USER node

CMD ["node", "apps/api/dist/server.js"]
