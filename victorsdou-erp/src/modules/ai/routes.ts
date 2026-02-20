import type { FastifyInstance } from 'fastify';
import { requireAnyOf } from '../../middleware/auth';
import { prisma } from '../../lib/prisma';
import { config } from '../../config';

export async function aiRoutes(app: FastifyInstance) {
  app.get('/forecasts/current', { preHandler: [requireAnyOf('OPS_MGR', 'SALES_MGR', 'FINANCE_MGR')] }, async (_req, reply) => {
    const version = await prisma.forecastVersion.findFirst({
      where: { isCurrent: true }, include: { run: true },
      orderBy: { createdAt: 'desc' },
    });
    if (!version) return reply.code(404).send({ error: 'NO_FORECAST', message: 'No current forecast available. Run a forecast first.' });
    return reply.send({ data: version });
  });

  app.post('/forecasts/run', { preHandler: [requireAnyOf('OPS_MGR')] }, async (req, reply) => {
    // Delegate to Python AI service
    const response = await fetch(`${config.AI_SERVICE_URL}/api/forecasts/run`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Api-Key': config.AI_SERVICE_API_KEY ?? '' },
      body: JSON.stringify({ triggered_by: req.actor!.sub }),
    }).catch(() => null);
    if (!response?.ok) {
      return reply.code(503).send({ error: 'AI_SERVICE_UNAVAILABLE', message: 'AI service is not available. Forecast has been queued.' });
    }
    const result = await response.json();
    return reply.code(202).send({ data: result });
  });

  app.patch('/forecasts/:id/override', { preHandler: [requireAnyOf('OPS_MGR', 'SALES_MGR')] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const { qty, lockUntilDate } = req.body as { qty: number; lockUntilDate?: string };
    const line = await prisma.forecastLine.update({
      where: { id },
      data: { forecastQty: qty, isManuallyOverridden: true, lockUntilDate: lockUntilDate ? new Date(lockUntilDate) : undefined, overriddenBy: req.actor!.sub, overriddenAt: new Date() },
    });
    return reply.send({ data: line });
  });

  app.get('/production-plan/suggest', { preHandler: [requireAnyOf('OPS_MGR')] }, async (_req, reply) => {
    const response = await fetch(`${config.AI_SERVICE_URL}/api/production-plan/suggest`, {
      headers: { 'X-Api-Key': config.AI_SERVICE_API_KEY ?? '' },
    }).catch(() => null);
    if (!response?.ok) return reply.code(503).send({ error: 'AI_SERVICE_UNAVAILABLE' });
    const plan = await response.json();
    return reply.send({ data: plan });
  });
}
