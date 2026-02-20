import type { FastifyInstance } from 'fastify';
import { requireAnyOf, requireAuth } from '../../middleware/auth';
import { prisma } from '../../lib/prisma';
import { getCache, setCache, CACHE_KEYS } from '../../lib/redis';

export async function catalogRoutes(app: FastifyInstance) {
  app.get('/', { preHandler: [requireAuth()] }, async (req, reply) => {
    const q = req.query as { categoryId?: string; search?: string; active?: string };
    const products = await prisma.product.findMany({
      where: {
        isActive: q.active !== 'false',
        ...(q.categoryId ? { categoryId: q.categoryId } : {}),
        ...(q.search ? { name: { contains: q.search, mode: 'insensitive' } } : {}),
      },
      include: { category: true },
      orderBy: { name: 'asc' },
    });
    return reply.send({ data: products });
  });

  app.get('/public', async (_req, reply) => {
    const cached = await getCache(CACHE_KEYS.catalog());
    if (cached) return reply.send({ data: cached });
    const products = await prisma.product.findMany({
      where: { isActive: true, isB2cVisible: true },
      select: { id: true, sku: true, name: true, basePricePen: true, taxClass: true,
                unitOfSale: true, imageUrl: true, category: true, minOrderQty: true },
    });
    await setCache(CACHE_KEYS.catalog(), products, 30);
    return reply.send({ data: products });
  });

  app.post('/', { preHandler: [requireAnyOf('OPS_MGR')] }, async (req, reply) => {
    const body = req.body as { sku: string; name: string; categoryId: string; basePricePen: number; taxClass?: string; unitOfSale?: string };
    const product = await prisma.product.create({ data: body as never });
    return reply.code(201).send({ data: product });
  });

  app.patch('/:id', { preHandler: [requireAnyOf('OPS_MGR')] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const product = await prisma.product.update({ where: { id }, data: req.body as never });
    return reply.send({ data: product });
  });

  /* ── Categories ─────────────────────────────────────────────────────── */

  app.get('/categories', { preHandler: [requireAuth()] }, async (_req, reply) => {
    const categories = await prisma.productCategory.findMany({ orderBy: { name: 'asc' } });
    return reply.send({ data: categories });
  });

  app.post('/categories', { preHandler: [requireAnyOf('OPS_MGR')] }, async (req, reply) => {
    const { name } = req.body as { name: string };
    const category = await prisma.productCategory.create({ data: { name } });
    return reply.code(201).send({ data: category });
  });
}
