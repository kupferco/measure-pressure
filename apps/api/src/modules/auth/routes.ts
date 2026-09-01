import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { emailSchema, requestMagicLinkSchema, verifyMagicLinkSchema } from '@mp/shared';
import { ApiError } from '../../lib/errors.js';
import { requireAuth, SESSION_COOKIE } from '../../lib/auth-plugin.js';
import { logout, requestLogin, updateProfile, verifyCode, verifyLinkToken } from './service.js';

const verifySchema = z.union([
  verifyMagicLinkSchema,
  z.object({ email: emailSchema, code: z.string().trim().regex(/^\d{6}$/, 'Six digits') }),
]);

export const authRoutes: FastifyPluginAsync = async (app) => {
  /**
   * Ask for a login email. Always answers 200, even for an address that does not
   * exist - the response must not reveal who has an account here.
   */
  app.post('/auth/request', {
    config: { rateLimit: { max: 10, timeWindow: '10 minutes' } },
    handler: async (request, reply) => {
      const input = requestMagicLinkSchema.parse(request.body);
      try {
        await requestLogin({ ...input, ip: request.ip });
      } catch (err) {
        if (err instanceof ApiError && err.statusCode === 429) throw err;
        request.log.error({ err }, 'failed to send login email');
      }
      return reply.send({ sent: true });
    },
  });

  /** Exchange a link token or a six-digit code for a session. */
  app.post('/auth/verify', {
    config: { rateLimit: { max: 20, timeWindow: '10 minutes' } },
    handler: async (request, reply) => {
      const input = verifySchema.parse(request.body);
      const userAgent = request.headers['user-agent'];

      const result =
        'token' in input
          ? await verifyLinkToken(input.token, userAgent)
          : await verifyCode(input.email, input.code, userAgent);

      reply.setSessionCookie(result.sessionToken);
      // The native app cannot use the cookie, so it gets the token in the body and
      // stores it in the device keychain.
      return reply.send({ user: result.user, sessionToken: result.sessionToken });
    },
  });

  app.post('/auth/logout', async (request, reply) => {
    const header = request.headers.authorization;
    const token = header?.startsWith('Bearer ')
      ? header.slice(7).trim()
      : request.cookies?.[SESSION_COOKIE];
    if (token) await logout(token);
    reply.clearSessionCookie();
    return reply.send({ ok: true });
  });

  app.get('/auth/me', { onRequest: [requireAuth] }, async (request) => ({
    user: request.requireUser(),
  }));

  app.patch('/auth/me', { onRequest: [requireAuth] }, async (request) => {
    const { name } = z.object({ name: z.string().trim().min(1).max(120) }).parse(request.body);
    return { user: await updateProfile(request.requireUser().id, name) };
  });
};
