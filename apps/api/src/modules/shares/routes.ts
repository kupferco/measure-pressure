import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { createShareSchema, uuidSchema } from '@mp/shared';
import { requireAuth } from '../../lib/auth-plugin.js';
import { inviteDoctor, listPatients, listShares, respondToInvite, revokeShare } from './service.js';

const idParams = z.object({ id: uuidSchema });

export const shareRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', requireAuth);

  app.get('/shares', async (request) => listShares(request.requireUser()));

  app.post('/shares', async (request, reply) => {
    const input = createShareSchema.parse(request.body);
    const share = await inviteDoctor(request.requireUser(), input);
    return reply.code(201).send({ share });
  });

  app.post('/shares/:id/respond', async (request) => {
    const { id } = idParams.parse(request.params);
    const { accept } = z.object({ accept: z.boolean() }).parse(request.body);
    return { share: await respondToInvite(request.requireUser(), id, accept) };
  });

  app.delete('/shares/:id', async (request, reply) => {
    const { id } = idParams.parse(request.params);
    await revokeShare(request.requireUser(), id);
    return reply.code(204).send();
  });

  /** The doctor's home screen. */
  app.get('/patients', async (request) => listPatients(request.requireUser()));
};
