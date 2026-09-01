import { existsSync } from 'node:fs';
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

  // Cloud Run's health check. Deliberately does not touch the database: a brief
  // Cloud SQL blip should not cause the instance to be torn down and replaced.
  app.get('/healthz', async () => ({ ok: true, env: config.APP_ENV }));

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
 * Serves the Expo web export from the same container as the API.
 *
 * One service instead of two: no CORS, one URL to remember, one thing to deploy.
 * The directory only exists in the built image, so locally this is a no-op and the
 * Expo dev server handles the web app instead.
 */
async function serveWebBuild(app: FastifyInstance): Promise<void> {
  const here = dirname(fileURLToPath(import.meta.url));
  const webRoot = process.env.WEB_ROOT
    ? resolve(process.env.WEB_ROOT)
    : resolve(here, '../web');

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
    return reply.sendFile('index.html');
  });
}
