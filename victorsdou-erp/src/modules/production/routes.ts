import type { FastifyInstance } from 'fastify';
import { requireAnyOf } from '../../middleware/auth';
import { prisma } from '../../lib/prisma';

export async function productionRoutes(app: FastifyInstance) {
  app.get('/orders', { preHandler: [requireAnyOf('PRODUCTION', 'OPS_MGR')] }, async (req, reply) => {
    const q = req.query as { status?: string; date?: string };
    const orders = await prisma.productionOrder.findMany({
      where: {
        ...(q.status ? { status: q.status as never } : {}),
        ...(q.date ? { scheduledDate: { gte: new Date(q.date) } } : {}),
      },
      include: { recipe: { include: { product: true } } },
      orderBy: { scheduledDate: 'asc' },
    });
    return reply.send({ data: orders });
  });

  app.post('/orders', { preHandler: [requireAnyOf('OPS_MGR')] }, async (req, reply) => {
    const body = req.body as {
      recipeId: string; recipeVersion: number;
      plannedQty: number; scheduledDate: string;
      shift?: string; linkedSalesOrderIds?: string[]; notes?: string;
    };
    const order = await prisma.productionOrder.create({
      data: { ...body, scheduledDate: new Date(body.scheduledDate),
        status: 'DRAFT', createdBy: req.actor!.sub },
    });
    return reply.code(201).send({ data: order });
  });

  app.patch('/orders/:id/status', { preHandler: [requireAnyOf('PRODUCTION', 'OPS_MGR')] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const { status } = req.body as { status: string };
    const order = await prisma.productionOrder.update({
      where: { id }, data: { status: status as never,
        ...(status === 'IN_PROGRESS' ? { startedAt: new Date() } : {}),
        ...(status === 'COMPLETED'   ? { completedAt: new Date() } : {}),
      },
    });
    return reply.send({ data: order });
  });

  // ── Recipe READ endpoints ─────────────────────────────────────────────────

  app.get('/recipes', { preHandler: [requireAnyOf('OPS_MGR', 'PRODUCTION')] }, async (_req, reply) => {
    const recipes = await prisma.recipe.findMany({
      where: { status: 'ACTIVE' },
      include: { product: true, bomLines: { include: { ingredient: true } } },
    });
    return reply.send({ data: recipes });
  });

  app.get('/recipes/:id/bom', { preHandler: [requireAnyOf('OPS_MGR', 'PRODUCTION')] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const recipe = await prisma.recipe.findUnique({
      where: { id }, include: { bomLines: { include: { ingredient: true } }, product: true },
    });
    if (!recipe) return reply.code(404).send({ error: 'NOT_FOUND' });
    return reply.send({ data: recipe });
  });

  /** Fetch the latest ACTIVE or DRAFT recipe for a product (used by the recipe editor in Products page) */
  app.get('/recipes/by-product/:productId', { preHandler: [requireAnyOf('OPS_MGR', 'PRODUCTION')] }, async (req, reply) => {
    const { productId } = req.params as { productId: string };
    const recipe = await prisma.recipe.findFirst({
      where: { productId, status: { in: ['ACTIVE', 'DRAFT'] } },
      include: { bomLines: { include: { ingredient: true } } },
      orderBy: { version: 'desc' },
    });
    return reply.send({ data: recipe ?? null });
  });

  // ── Recipe WRITE endpoints ────────────────────────────────────────────────

  /** Create a new DRAFT recipe for a product */
  app.post('/recipes', { preHandler: [requireAnyOf('OPS_MGR')] }, async (req, reply) => {
    const body = req.body as {
      productId: string;
      yieldQty: number;
      yieldUom: string;
      effectiveFrom?: string;
      changeReason?: string;
    };
    // Determine next version number
    const lastRecipe = await prisma.recipe.findFirst({
      where: { productId: body.productId },
      orderBy: { version: 'desc' },
    });
    const version = (lastRecipe?.version ?? 0) + 1;
    const recipe = await prisma.recipe.create({
      data: {
        productId: body.productId,
        version,
        yieldQty: body.yieldQty,
        yieldUom: body.yieldUom,
        effectiveFrom: body.effectiveFrom ? new Date(body.effectiveFrom) : new Date(),
        changeReason: body.changeReason,
        status: 'DRAFT',
        createdBy: req.actor!.sub,
      },
      include: { bomLines: { include: { ingredient: true } } },
    });
    return reply.code(201).send({ data: recipe });
  });

  /** Replace all BOM lines for a recipe (atomic PUT) */
  app.put('/recipes/:id/bom', { preHandler: [requireAnyOf('OPS_MGR')] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const { lines } = req.body as {
      lines: {
        ingredientId: string;
        qtyRequired: number;
        uom: string;
        wasteFactorPct?: number;
        notes?: string;
      }[];
    };
    // Atomic replace: delete existing, create new
    await prisma.bOMLine.deleteMany({ where: { recipeId: id } });
    if (lines.length > 0) {
      await prisma.bOMLine.createMany({
        data: lines.map(l => ({
          recipeId: id,
          ingredientId: l.ingredientId,
          qtyRequired: l.qtyRequired,
          uom: l.uom,
          wasteFactorPct: l.wasteFactorPct ?? 0,
          notes: l.notes ?? null,
        })),
      });
    }
    const recipe = await prisma.recipe.findUnique({
      where: { id },
      include: { bomLines: { include: { ingredient: true } } },
    });
    return reply.send({ data: recipe });
  });

  /** Remove a single BOM line */
  app.delete('/recipes/:id/bom-lines/:lineId', { preHandler: [requireAnyOf('OPS_MGR')] }, async (req, reply) => {
    const { lineId } = req.params as { id: string; lineId: string };
    await prisma.bOMLine.delete({ where: { id: lineId } });
    return reply.code(204).send();
  });

  /** Activate / Archive a recipe */
  app.patch('/recipes/:id/status', { preHandler: [requireAnyOf('OPS_MGR')] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const { status } = req.body as { status: string };
    // When activating, archive all other active recipes for the same product
    if (status === 'ACTIVE') {
      const target = await prisma.recipe.findUnique({ where: { id } });
      if (target) {
        await prisma.recipe.updateMany({
          where: { productId: target.productId, status: 'ACTIVE', id: { not: id } },
          data: { status: 'ARCHIVED' },
        });
      }
    }
    const updated = await prisma.recipe.update({
      where: { id },
      data: {
        status: status as never,
        ...(status === 'ACTIVE' ? { approvedBy: req.actor!.sub } : {}),
      },
      include: { bomLines: { include: { ingredient: true } } },
    });
    return reply.send({ data: updated });
  });
}
