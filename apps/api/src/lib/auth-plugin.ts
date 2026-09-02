import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import type { User } from '@mp/shared';
import { config } from '../config.js';
import { resolveSession } from '../modules/auth/service.js';
import { ApiError } from './errors.js';

/*
 * The name is not a preference: Firebase Hosting strips every cookie except one
 * called __session from requests it forwards to Cloud Run, so that the CDN can
 * cache safely. Any other name is silently dropped, and the API sees an
 * unauthenticated request no matter how correctly the browser stored it.
 *
 * The patient app never noticed because it authenticates with a bearer token; the
 * clinician app is cookie-only and could not stay signed in at all.
 */
export const SESSION_COOKIE = '__session';

declare module 'fastify' {
  interface FastifyRequest {
    /** The signed-in user, or null. Populated on every request. */
    currentUser: User | null;
    /** The user, or a 401. Use in any handler that needs an identity. */
    requireUser(): User;
  }
  interface FastifyReply {
    setSessionCookie(token: string): void;
    clearSessionCookie(): void;
  }
}

/**
 * Two clients, two idioms: the web build carries an httpOnly cookie (which JavaScript
 * cannot read, so an XSS cannot steal it), the native app carries a Bearer token in
 * secure device storage (where cookies are awkward). Same session row behind both.
 */
function extractToken(request: FastifyRequest): { token: string; fromCookie: boolean } | null {
  const header = request.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    const token = header.slice(7).trim();
    if (token) return { token, fromCookie: false };
  }
  const cookie = request.cookies?.[SESSION_COOKIE];
  return cookie ? { token: cookie, fromCookie: true } : null;
}

const plugin: FastifyPluginAsync = async (app) => {
  app.decorateRequest('currentUser', null);
  app.decorateRequest('requireUser', function (this: FastifyRequest) {
    if (!this.currentUser) throw ApiError.unauthorized();
    return this.currentUser;
  });

  app.decorateReply('setSessionCookie', function (this: FastifyReply, token: string) {
    this.setCookie(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: config.APP_ENV !== 'local',
      sameSite: 'lax',
      path: '/',
      maxAge: config.SESSION_TTL_DAYS * 24 * 60 * 60,
      ...(config.COOKIE_DOMAIN ? { domain: config.COOKIE_DOMAIN } : {}),
    });
  });

  app.decorateReply('clearSessionCookie', function (this: FastifyReply) {
    this.clearCookie(SESSION_COOKIE, { path: '/' });
  });

  app.addHook('onRequest', async (request, reply) => {
    const found = extractToken(request);
    request.currentUser = found ? await resolveSession(found.token) : null;

    // The session's expiry slides forward on every use, but a cookie carries its
    // own lifetime in the browser. Without re-issuing it, the cookie would lapse
    // on a fixed schedule and sign the user out of a session the server still
    // considers live. The native app stores its token itself and needs none of this.
    if (request.currentUser && found?.fromCookie) {
      reply.setSessionCookie(found.token);
    }
  });
};

export const authPlugin = fp(plugin, { name: 'auth' });

/** Route-level guard: `{ onRequest: [requireAuth] }`. */
export async function requireAuth(request: FastifyRequest): Promise<void> {
  if (!request.currentUser) throw ApiError.unauthorized();
}
