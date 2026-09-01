# One image: the API, with the Expo web build baked in and served from the same
# process. Fewer moving parts than a separate static host, and no CORS.

# ---------------------------------------------------------------- build
FROM node:22-alpine AS build
WORKDIR /app

# Manifests first, so a change to source code does not invalidate the install layer.
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/app/package.json apps/app/
RUN npm ci

COPY . .

RUN npm run build --workspace=@mp/shared \
 && npm run build --workspace=@mp/api

# EXPO_PUBLIC_ variables are inlined at build time. Left empty on purpose: the web
# build talks to whatever origin it is served from, which is this same container.
RUN cd apps/app \
 && EXPO_PUBLIC_API_URL="" npx expo export --platform web --output-dir /webdist

# ---------------------------------------------------------------- runtime deps
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
# The Expo app contributes nothing at runtime - it is already a folder of static
# files - so its dependencies are left out of the final image entirely.
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
COPY --from=build /webdist                     ./apps/api/web

# Cloud Run sets PORT; the app reads it.
ENV PORT=8080
EXPOSE 8080

# Never run as root, even for a three-user app.
USER node

CMD ["node", "apps/api/dist/server.js"]
