import type { FastifyInstance } from 'fastify';
import { requireAnyOf } from '../../middleware/auth';
import { prisma } from '../../lib/prisma';
import { getOverheadRate } from '../../lib/settings';
import * as InventoryService from '../inventory/service';

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

  // ── Close production order ──────────────────────────────────────────────
  //
  // Body:
  //   completedAt:    ISO timestamp of real production end
  //   actualYieldQty: real produced quantity (units)
  //   consumptions:   [{ ingredientId, actualQty, lotNumber? }]
  //
  // Effects (inside a single transaction):
  //  1. For each consumption: subtract stock from the RAW_MATERIAL warehouse
  //     using the existing WAC infra (records a PRODUCTION_CONSUMPTION).
  //  2. Compute the finished-good cost:
  //       rawCost      = sum(actualQty * ingredient.avgCostPen)
  //       totalCost    = rawCost / (1 - overheadRate)
  //       unitCost     = totalCost / actualYieldQty
  //  3. Update Product.avgCostPen using WAC against any prior stock recorded
  //     in ProductStockLevel rows.
  //  4. Insert a PRODUCTION_OUTPUT row into product_stock_movements and
  //     upsert ProductStockLevel for the appropriate finished/intermediate
  //     warehouse.
  //  5. Set ProductionOrder.status=COMPLETED, completedAt, actualQty.
  app.post('/orders/:id/close', { preHandler: [requireAnyOf('PRODUCTION', 'OPS_MGR', 'SUPER_ADMIN')] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as {
      completedAt:    string;
      actualYieldQty: number;
      consumptions:   { ingredientId: string; actualQty: number; lotNumber?: string; batchId?: string }[];
      finishedLotNumber?: string;
      finishedExpiryDate?: string;
      notes?: string;
    };

    if (!body.completedAt || !body.actualYieldQty || !Array.isArray(body.consumptions)) {
      return reply.code(400).send({ error: 'completedAt, actualYieldQty and consumptions are required' });
    }
    if (body.actualYieldQty <= 0) {
      return reply.code(400).send({ error: 'actualYieldQty must be > 0' });
    }

    // Pre-flight: look up the order, recipe, and product.
    const order = await prisma.productionOrder.findUnique({
      where:   { id },
      include: { recipe: { include: { product: true } } },
    });
    if (!order) return reply.code(404).send({ error: 'Production order not found' });
    if (order.status === 'COMPLETED' || order.status === 'CANCELLED') {
      return reply.code(422).send({ error: `Order is already ${order.status}` });
    }

    const product = order.recipe.product;
    const overheadRate = await getOverheadRate();

    // Pick the destination warehouse based on product type. Default to the
    // first FINISHED_GOODS or INTERMEDIATE warehouse matching the product type.
    const destType = product.productType === 'INTERMEDIATE' ? 'INTERMEDIATE' : 'FINISHED_GOODS';
    const destWarehouse = await prisma.warehouse.findFirst({
      where:   { type: destType as never, isActive: true },
      orderBy: { createdAt: 'asc' },
    });
    if (!destWarehouse) {
      return reply.code(422).send({ error: `No active warehouse of type ${destType} found` });
    }

    // 1) Apply consumptions (one at a time so WAC + reservation logic kicks in).
    let rawCost = 0;
    for (const c of body.consumptions) {
      if (!c.ingredientId || c.actualQty <= 0) continue;
      const ing = await prisma.ingredient.findUnique({ where: { id: c.ingredientId } });
      if (!ing) return reply.code(422).send({ error: `Ingredient ${c.ingredientId} not found` });
      const avgCost = Number(ing.avgCostPen);
      rawCost += c.actualQty * avgCost;

      // Find the raw-material warehouse for the consumption.
      const rawWh = await prisma.warehouse.findFirst({
        where:   { type: 'RAW_MATERIAL' as never, isActive: true },
        orderBy: { createdAt: 'asc' },
      });
      if (!rawWh) return reply.code(422).send({ error: 'No active RAW_MATERIAL warehouse' });

      await InventoryService.recordStockOut({
        type:         'PRODUCTION_CONSUMPTION' as never,
        ingredientId: c.ingredientId,
        warehouseId:  rawWh.id,
        qty:          c.actualQty,
        unitCost:     avgCost,
        notes:        [c.lotNumber ? `Lote: ${c.lotNumber}` : null, `OP: ${order.orderNumber}`].filter(Boolean).join(' | '),
        createdBy:    req.actor!.sub,
        refDocType:   'production_order',
        refDocId:     order.id,
        batchId:      c.batchId,
      });

      // Record the consumption row for traceability.
      await prisma.productionConsumption.create({
        data: {
          productionOrderId: order.id,
          ingredientId:      c.ingredientId,
          batchId:           c.batchId,
          plannedQty:        0,
          actualQty:         c.actualQty,
          postedAt:          new Date(),
        },
      });
    }

    // 2) Cost the finished unit.
    const safeRate    = Math.min(Math.max(overheadRate, 0), 0.99);
    const totalCost   = safeRate < 1 ? rawCost / (1 - safeRate) : rawCost;
    const overheadVal = totalCost - rawCost;
    const unitCost    = totalCost / body.actualYieldQty;

    // 3) Upsert ProductStockLevel with WAC against any prior stock.
    const existingLevel = await (prisma as any).productStockLevel.findUnique({
      where: { productId_warehouseId: { productId: product.id, warehouseId: destWarehouse.id } },
    });
    const currentQty   = existingLevel ? Number(existingLevel.qtyOnHand) : 0;
    const currentAvg   = existingLevel ? Number(existingLevel.avgCostPen) : 0;
    const newQty       = currentQty + body.actualYieldQty;
    const newAvgCost   = newQty > 0
      ? (currentQty * currentAvg + body.actualYieldQty * unitCost) / newQty
      : unitCost;

    await (prisma as any).productStockLevel.upsert({
      where:  { productId_warehouseId: { productId: product.id, warehouseId: destWarehouse.id } },
      create: {
        productId:      product.id,
        warehouseId:    destWarehouse.id,
        qtyOnHand:      body.actualYieldQty,
        avgCostPen:     unitCost,
        lastMovementAt: new Date(),
      },
      update: {
        qtyOnHand:      newQty,
        avgCostPen:     newAvgCost,
        lastMovementAt: new Date(),
      },
    });

    // 4) Update the running Product.avgCostPen (global WAC for the SKU).
    await prisma.product.update({
      where: { id: product.id },
      data:  { avgCostPen: newAvgCost as never },
    });

    // 5) Insert a PRODUCTION_OUTPUT row into product_stock_movements.
    await (prisma as any).productStockMovement.create({
      data: {
        type:               'PRODUCTION_OUTPUT' as never,
        productId:          product.id,
        warehouseId:        destWarehouse.id,
        qtyIn:              body.actualYieldQty,
        qtyOut:             0,
        unitCostPen:        unitCost,
        totalCostPen:       totalCost,
        balanceAfter:       newQty,
        productionOrderRef: order.orderNumber,
        lotNumber:          body.finishedLotNumber ?? null,
        productionDate:     new Date(body.completedAt),
        expiryDate:         body.finishedExpiryDate ? new Date(body.finishedExpiryDate) : null,
        notes:              body.notes ?? null,
        createdBy:          req.actor!.sub,
      },
    });

    // 6) Update the order itself.
    const updatedOrder = await prisma.productionOrder.update({
      where: { id },
      data:  {
        status:      'COMPLETED' as never,
        actualQty:   body.actualYieldQty,
        completedAt: new Date(body.completedAt),
        notes:       body.notes ?? order.notes,
      },
    });

    return reply.send({
      data: {
        order:           updatedOrder,
        cost: {
          rawCost:       Math.round(rawCost * 100) / 100,
          overheadCost:  Math.round(overheadVal * 100) / 100,
          totalCost:     Math.round(totalCost * 100) / 100,
          unitCost:      Math.round(unitCost * 10000) / 10000,
          newAvgCost:    Math.round(newAvgCost * 10000) / 10000,
        },
        warehouse:       destWarehouse.name,
      },
    });
  });
}
