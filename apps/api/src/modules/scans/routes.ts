import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../../lib/auth-plugin.js';
import { ApiError } from '../../lib/errors.js';
import { readOwnedImage, scanImage } from './service.js';

const MAX_IMAGE_BYTES = 12 * 1024 * 1024;

export const scanRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', requireAuth);

  /**
   * The first step of the capture flow: a photo in, three provisional numbers out.
   * Nothing is saved as a reading here - the client shows the confirm screen and
   * then posts to /readings with whatever the user actually approved.
   */
  app.post('/scans', {
    config: { rateLimit: { max: 60, timeWindow: '10 minutes' } },
    handler: async (request, reply) => {
      const file = await request.file({ limits: { fileSize: MAX_IMAGE_BYTES } });
      if (!file) throw ApiError.badRequest('Attach a photo of the monitor.');

      const buffer = await file.toBuffer().catch(() => {
        throw ApiError.tooLarge('That photo is too large. 12 MB is the limit.');
      });

      const result = await scanImage(request.requireUser().id, buffer, file.mimetype);
      return reply.send(result);
    },
  });

  /** Only reachable in local development, where images live on disk. */
  app.get('/scans/image/*', async (request, reply) => {
    const { '*': objectName } = z.object({ '*': z.string().min(1).max(300) }).parse(request.params);
    const image = await readOwnedImage(request.requireUser().id, objectName);
    if (!image) throw ApiError.notFound('Image not found.');
    return reply.type('image/jpeg').send(image);
  });
};
