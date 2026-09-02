import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  createReadingSchema,
  listReadingsQuerySchema,
  updateReadingSchema,
  uuidSchema,
} from '@mp/shared';
import { requireAuth } from '../../lib/auth-plugin.js';
import { ApiError } from '../../lib/errors.js';
import {
  createReading,
  deleteAllReadings,
  deleteReading,
  getReading,
  listReadings,
  updateReading,
} from './service.js';

const idParams = z.object({ id: uuidSchema });

export const readingRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', requireAuth);

  app.get('/readings', async (request) => {
    const params = listReadingsQuerySchema.parse(request.query);
    return listReadings(request.requireUser(), params);
  });

  app.get('/readings/:id', async (request) => {
    const { id } = idParams.parse(request.params);
    return { reading: await getReading(request.requireUser(), id) };
  });

  app.post('/readings', async (request, reply) => {
    const input = createReadingSchema.parse(request.body);
    const reading = await createReading(request.requireUser().id, input);
    return reply.code(201).send({ reading });
  });

  app.patch('/readings/:id', async (request) => {
    const { id } = idParams.parse(request.params);
    const input = updateReadingSchema.parse(request.body);
    return { reading: await updateReading(request.requireUser().id, id, input) };
  });

  /**
   * Wipes this person's readings. Requires the caller to type their own email back,
   * which is a deliberate speed bump on an irreversible action.
   */
  app.delete('/readings', async (request) => {
    const user = request.requireUser();
    const { confirmEmail } = z.object({ confirmEmail: z.string() }).parse(request.body);
    if (confirmEmail.trim().toLowerCase() !== user.email) {
      throw ApiError.badRequest('Type your email address exactly to confirm.');
    }
    return deleteAllReadings(user.id);
  });

  app.delete('/readings/:id', async (request, reply) => {
    const { id } = idParams.parse(request.params);
    await deleteReading(request.requireUser().id, id);
    return reply.code(204).send();
  });
};
