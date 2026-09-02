import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  emailSchema,
  requestMagicLinkSchema,
  updateProfileSchema,
  verifyMagicLinkSchema,
} from '@mp/shared';
import { ApiError } from '../../lib/errors.js';
import { MailDeliveryError } from '../../lib/mailer.js';
import { requireAuth, SESSION_COOKIE } from '../../lib/auth-plugin.js';
import {
  describeUsage,
  logout,
  requestLogin,
  updateProfile,
  verifyCode,
  verifyLinkToken,
} from './service.js';

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
        if (err instanceof ApiError) throw err;

        /*
         * Say so when the email is not coming.
         *
         * This endpoint deliberately answers the same way for an address that has
         * an account and one that does not - but a delivery failure is not about
         * the address at all, so reporting it reveals nothing. The alternative,
         * replying "sent" regardless, leaves someone watching an inbox for a
         * message that was refused.
         */
        if (err instanceof MailDeliveryError) {
          request.log.error({ reason: err.message }, 'could not send the sign-in email');
          throw new ApiError(
            502,
            'mail_failed',
            err.configuration
              ? 'This app cannot send email at the moment, so the code could not be sent. ' +
                  'Whoever runs it needs to check the mail configuration.'
              : 'The code could not be sent just now. Please try again in a moment.',
          );
        }
        throw err;
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
    // Both credentials point at the same session row, so deleting it is enough.
    reply.clearSessionCookie();
    return reply.send({ ok: true });
  });

  /**
   * The session, plus how this person uses the app. The counts are what let the
   * client choose a home screen without a second round trip on every launch.
   */
  app.get('/auth/me', { onRequest: [requireAuth] }, async (request) => {
    const user = request.requireUser();
    return { user, ...(await describeUsage(user.id, user.email)) };
  });

  app.patch('/auth/me', { onRequest: [requireAuth] }, async (request) => {
    const input = updateProfileSchema.parse(request.body);
    return { user: await updateProfile(request.requireUser().id, input) };
  });
};
