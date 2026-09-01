import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  createReadingSchema,
  listReadingsQuerySchema,
  updateReadingSchema,
  uuidSchema,
} from '@mp/shared';
import { requireAuth } from '../../lib/auth-plugin.js';
import {
  createReading,
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

  app.delete('/readings/:id', async (request, reply) => {
    const { id } = idParams.parse(request.params);
    await deleteReading(request.requireUser().id, id);
    return reply.code(204).send();
  });
};
