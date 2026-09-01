import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import type { User } from '@mp/shared';
import { config } from '../config.js';
import { resolveSession } from '../modules/auth/service.js';
import { ApiError } from './errors.js';

export const SESSION_COOKIE = 'mp_session';

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
function extractToken(request: FastifyRequest): string | null {
  const header = request.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    const token = header.slice(7).trim();
    if (token) return token;
  }
  const cookie = request.cookies?.[SESSION_COOKIE];
  return cookie ?? null;
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

  app.addHook('onRequest', async (request) => {
    const token = extractToken(request);
    request.currentUser = token ? await resolveSession(token) : null;
  });
};

export const authPlugin = fp(plugin, { name: 'auth' });

/** Route-level guard: `{ onRequest: [requireAuth] }`. */
export async function requireAuth(request: FastifyRequest): Promise<void> {
  if (!request.currentUser) throw ApiError.unauthorized();
}
