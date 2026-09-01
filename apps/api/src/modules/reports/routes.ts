import type { FastifyPluginAsync } from 'fastify';
import { reportQuerySchema } from '@mp/shared';
import { requireAuth } from '../../lib/auth-plugin.js';
import { buildInsights, buildSeries, buildSummary } from './service.js';

export const reportRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', requireAuth);

  app.get('/reports/summary', async (request) => {
    const params = reportQuerySchema.parse(request.query);
    return { summary: await buildSummary(request.requireUser(), params) };
  });

  app.get('/reports/series', async (request) => {
    const params = reportQuerySchema.parse(request.query);
    return buildSeries(request.requireUser(), params);
  });

  app.get('/reports/insights', async (request) => {
    const params = reportQuerySchema.parse(request.query);
    return { insights: await buildInsights(request.requireUser(), params) };
  });
};
