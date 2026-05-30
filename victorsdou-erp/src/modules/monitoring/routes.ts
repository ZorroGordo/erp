import { FastifyInstance } from 'fastify';
import { prisma } from '../../lib/prisma';
import { config } from '../../config';
import { requireAnyOf } from '../../middleware/auth';

export async function monitoringRoutes(app: FastifyInstance) {
  // ── GET /v1/monitoring/error-logs — recent errors (in-app, authenticated) ──
  app.get('/error-logs', { preHandler: [requireAnyOf('SUPER_ADMIN', 'OPS_MGR')] }, async (req, reply) => {
    const q = req.query as { limit?: string };
    const take = Math.min(parseInt(q.limit ?? '200') || 200, 1000);
    const logs = await (prisma as any).errorLog.findMany({ orderBy: { createdAt: 'desc' }, take });
    return reply.send({ data: logs });
  });

  // ── GET /v1/monitoring/error-digest — grouped summary for the weekly automation ──
  // Token-gated (no user session) so a scheduled job can pull it. Requires
  // MONITORING_TOKEN to be set; otherwise the endpoint is disabled.
  app.get('/error-digest', async (req, reply) => {
    const q = req.query as { token?: string; days?: string };
    if (!config.MONITORING_TOKEN || q.token !== config.MONITORING_TOKEN) {
      return reply.code(401).send({ error: 'UNAUTHORIZED' });
    }
    const days  = Math.min(parseInt(q.days ?? '7') || 7, 90);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const logs  = await (prisma as any).errorLog.findMany({
      where:   { createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
    });

    // Group identical errors so the digest is readable.
    const groups = new Map<string, any>();
    for (const l of logs) {
      const key = `${l.statusCode}|${l.method ?? ''}|${l.path ?? ''}|${l.code ?? ''}|${(l.message ?? '').slice(0, 120)}`;
      const g = groups.get(key) ?? {
        statusCode: l.statusCode, method: l.method, path: l.path,
        code: l.code, message: l.message, count: 0, lastSeen: l.createdAt,
      };
      g.count += 1;
      if (new Date(l.createdAt) > new Date(g.lastSeen)) g.lastSeen = l.createdAt;
      groups.set(key, g);
    }
    const summary = [...groups.values()].sort((a, b) => b.count - a.count);
    return reply.send({ data: { sinceDays: days, total: logs.length, distinct: summary.length, groups: summary } });
  });
}
