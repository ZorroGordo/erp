import type { FastifyInstance } from 'fastify';
import { requireAnyOf, requireAuth } from '../../middleware/auth';
import { getOverheadRate, setOverheadRate } from '../../lib/settings';

export async function settingsRoutes(app: FastifyInstance) {
  // ── GET /v1/settings/overhead ───────────────────────────────────────
  app.get('/overhead', { preHandler: [requireAuth()] }, async (_req, reply) => {
    const rate = await getOverheadRate();
    return reply.send({ data: { rate } });
  });

  // ── PUT /v1/settings/overhead ───────────────────────────────────────
  app.put('/overhead', { preHandler: [requireAnyOf('OPS_MGR', 'FINANCE_MGR', 'SUPER_ADMIN')] }, async (req, reply) => {
    const { rate } = req.body as { rate: number };
    if (typeof rate !== 'number' || Number.isNaN(rate)) {
      return reply.code(400).send({ error: 'rate must be a number between 0 and 0.99' });
    }
    const saved = await setOverheadRate(rate, req.actor?.sub);
    return reply.send({ data: { rate: saved } });
  });
}
