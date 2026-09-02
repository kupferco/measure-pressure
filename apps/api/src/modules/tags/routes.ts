import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { createTagSchema, updateTagSchema, uuidSchema } from '@mp/shared';
import { requireAuth } from '../../lib/auth-plugin.js';
import { createTag, listTags, removeTag, reorderTags, updateTag } from './service.js';

const idParams = z.object({ id: uuidSchema });

export const tagRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', requireAuth);

  app.get('/tags', async (request) => {
    const { includeArchived } = z
      .object({ includeArchived: z.coerce.boolean().default(false) })
      .parse(request.query);
    return { tags: await listTags(request.requireUser().id, includeArchived) };
  });

  app.post('/tags', async (request, reply) => {
    const input = createTagSchema.parse(request.body);
    return reply.code(201).send({ tag: await createTag(request.requireUser().id, input) });
  });

  app.patch('/tags/:id', async (request) => {
    const { id } = idParams.parse(request.params);
    const input = updateTagSchema.parse(request.body);
    return { tag: await updateTag(request.requireUser().id, id, input) };
  });

  app.delete('/tags/:id', async (request) => {
    const { id } = idParams.parse(request.params);
    return removeTag(request.requireUser().id, id);
  });

  app.post('/tags/reorder', async (request) => {
    const { ids } = z.object({ ids: z.array(uuidSchema).max(200) }).parse(request.body);
    return { tags: await reorderTags(request.requireUser().id, ids) };
  });
};
