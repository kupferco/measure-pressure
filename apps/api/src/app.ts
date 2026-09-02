import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance, type FastifyReply } from 'fastify';
import { ZodError } from 'zod';
import { config } from './config.js';
import { authPlugin } from './lib/auth-plugin.js';
import { ApiError } from './lib/errors.js';
import { authRoutes } from './modules/auth/routes.js';
import { readingRoutes } from './modules/readings/routes.js';
import { reportRoutes } from './modules/reports/routes.js';
import { scanRoutes } from './modules/scans/routes.js';
import { shareRoutes } from './modules/shares/routes.js';
import { tagRoutes } from './modules/tags/routes.js';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: config.LOG_LEVEL,
      // Never let a login code or session token reach the logs.
      redact: ['req.headers.authorization', 'req.headers.cookie', 'body.token', 'body.code'],
    },
    // Cloud Run terminates TLS and forwards the client address in X-Forwarded-For.
    trustProxy: true,
    bodyLimit: 1024 * 1024,
  });

  await app.register(cors, {
    origin: (origin, callback) => {
      // No Origin header: a native app or a server-side call, both fine.
      if (!origin) return callback(null, true);
      // In local development the origin is whatever address the Expo dev server
      // happens to be on - localhost on this machine, a LAN IP from a phone. That
      // cannot be listed ahead of time, and nothing sensitive is reachable here.
      if (config.APP_ENV === 'local') return callback(null, true);
      callback(null, config.allowedOrigins.includes(origin));
    },
    credentials: true,
  });

  await app.register(cookie);
  await app.register(multipart, { limits: { fileSize: 12 * 1024 * 1024, files: 1 } });
  await app.register(rateLimit, { global: false, max: 300, timeWindow: '1 minute' });
  await app.register(authPlugin);

  /*
   * Nothing under /api may be cached.
   *
   * Firebase Hosting puts the __session cookie in its CDN cache key, so a cached
   * response can only be reused for the same session - but "same session" is not
   * a guarantee worth relying on for medical data. Saying no-store removes the
   * question entirely.
   */
  app.addHook('onSend', async (request, reply) => {
    if (request.url.startsWith('/api/')) {
      reply.header('Cache-Control', 'private, no-store');
    }
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({
        error: 'bad_request',
        message: 'Some of those values are not valid.',
        details: error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }
    if (error instanceof ApiError) {
      return reply
        .code(error.statusCode)
        .send({ error: error.code, message: error.message, details: error.details });
    }
    // Narrowing past the two branches above leaves TypeScript without a usable
    // type, so read the status defensively rather than asserting one.
    if ((error as { statusCode?: number }).statusCode === 429) {
      return reply.code(429).send({ error: 'too_many_requests', message: 'Slow down a moment.' });
    }

    // Anything unrecognised is a bug. Log it in full, tell the client nothing.
    request.log.error({ err: error }, 'unhandled error');
    return reply
      .code(500)
      .send({ error: 'internal_error', message: 'Something went wrong on our side.' });
  });

  /*
   * Liveness. Deliberately does not touch the database: a brief blip there should
   * not cause the instance to be torn down and replaced.
   *
   * Not /healthz - Google's frontend intercepts that path on run.app domains and
   * answers its own 404, so the request never reaches the container. Everything
   * else gets through; that one name does not.
   */
  const health = async () => ({ ok: true, env: config.APP_ENV });
  app.get('/health', health);
  // Also under /api, which is the only prefix Firebase Hosting forwards.
  app.get('/api/health', health);

  await app.register(
    async (api) => {
      await api.register(authRoutes);
      await api.register(tagRoutes);
      await api.register(readingRoutes);
      await api.register(scanRoutes);
      await api.register(reportRoutes);
      await api.register(shareRoutes);
    },
    { prefix: '/api' },
  );

  await serveWebBuild(app);

  return app;
}

/**
 * Where the two client builds live inside the image. Both are absent in
 * development, where each has its own dev server.
 */
function buildRoot(name: string): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return process.env[name === 'web' ? 'WEB_ROOT' : 'DOCTOR_ROOT']
    ? resolve(process.env[name === 'web' ? 'WEB_ROOT' : 'DOCTOR_ROOT']!)
    : resolve(here, `../${name}`);
}

/**
 * Serves the Expo web export from the same container as the API.
 *
 * One service instead of two: no CORS, one URL to remember, one thing to deploy.
 * The directory only exists in the built image, so locally this is a no-op and the
 * Expo dev server handles the web app instead.
 */
async function serveWebBuild(app: FastifyInstance): Promise<void> {
  const webRoot = buildRoot('web');
  const doctorRoot = buildRoot('doctor');
  const hasDoctor = existsSync(join(doctorRoot, 'index.html'));

  // The clinician app is a separate build with its own conventions, served under
  // its own prefix from this same container. One service, one origin - so its
  // session cookie is the same cookie, with no CORS between them.
  if (hasDoctor) {
    await app.register(fastifyStatic, {
      root: doctorRoot,
      prefix: '/doctor/',
      decorateReply: false,
    });
  }

  const apiNotFound = (reply: FastifyReply) =>
    reply.code(404).send({ error: 'not_found', message: 'No such endpoint.' });

  if (!existsSync(join(webRoot, 'index.html'))) {
    app.log.info({ webRoot }, 'no web build bundled - serving api only');
    app.setNotFoundHandler((_request, reply) => apiNotFound(reply));
    return;
  }

  await app.register(fastifyStatic, { root: webRoot });

  // Expo Router builds a single-page app: every unmatched path that is not an API
  // call has to fall through to index.html so deep links work on refresh.
  app.setNotFoundHandler((request, reply) => {
    if (request.url.startsWith('/api/')) return apiNotFound(reply);

    // The clinician app routes on the client, so any /doctor path it does not
    // have a file for falls back to its own index.
    if (hasDoctor && (request.url === '/doctor' || request.url.startsWith('/doctor/'))) {
      return reply.type('text/html').send(readFileSync(join(doctorRoot, 'index.html')));
    }

    // The web build is statically rendered: every route has its own pre-rendered
    // file, so /dashboard should serve dashboard.html rather than making the
    // browser boot the app and route itself. Falls back to index.html for
    // anything unrecognised, which the client router then resolves.
    const path = request.url.split('?')[0]?.replace(/^\/+|\/+$/g, '') ?? '';
    if (/^[a-z0-9\-_/]*$/i.test(path) && path.length > 0) {
      const candidate = join(webRoot, `${path}.html`);
      if (candidate.startsWith(webRoot) && existsSync(candidate)) {
        return reply.type('text/html').send(readFileSync(candidate));
      }
    }
    return reply.sendFile('index.html');
  });
}
