import type { FastifyInstance } from 'fastify';
import { requireAnyOf } from '../../middleware/auth';
import { prisma } from '../../lib/prisma';
import { getOverheadRate } from '../../lib/settings';
import * as InventoryService from '../inventory/service';

// ── Lot / order-number helpers ──────────────────────────────────────────────
// Structured lot number = order number: YY + DDD + Line + BB
//   YY  = 2-digit year   (26)
//   DDD = day of year     (001-366)
//   Line= production line (A | B | C)
//   BB  = batch # that day+line (01, 02 …)
//   e.g. 26001A01 = 2026, 1 Jan, line A, batch 1
function dayOfYear(d: Date): number {
  const start = Date.UTC(d.getUTCFullYear(), 0, 0);
  const cur   = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return Math.floor((cur - start) / 86_400_000);
}

async function generateLotNumber(scheduled: Date, line: string): Promise<string> {
  const yy     = String(scheduled.getUTCFullYear() % 100).padStart(2, '0');
  const ddd    = String(dayOfYear(scheduled)).padStart(3, '0');
  const prefix = `${yy}${ddd}${line}`;
  const count  = await prisma.productionOrder.count({ where: { orderNumber: { startsWith: prefix } } });
  return `${prefix}${String(count + 1).padStart(2, '0')}`;
}

// ── Inventory reservation helpers ───────────────────────────────────────────
// On order creation we reserve each BOM ingredient (scaled to the planned qty)
// by incrementing StockLevel.qtyReserved, so it can't be consumed or assigned
// to another order (recordStockOut already enforces available = onHand − reserved).
async function reserveForOrder(tx: any, orderId: string, recipe: any, plannedQty: number) {
  const yieldQty = Number(recipe.yieldQty) || 1;
  const scale    = plannedQty / yieldQty;
  for (const l of recipe.bomLines ?? []) {
    const qty = Number(l.qtyRequired) * (1 + Number(l.wasteFactorPct) / 100) * scale;
    if (!(qty > 0)) continue;
    const whType = l.ingredient?.productType === 'INTERMEDIATE' ? 'INTERMEDIATE' : 'RAW_MATERIAL';
    let wh = await tx.warehouse.findFirst({ where: { type: whType as never, isActive: true }, orderBy: { createdAt: 'asc' } });
    if (!wh) {
      const anyLevel = await tx.stockLevel.findFirst({ where: { ingredientId: l.ingredientId } });
      if (anyLevel) wh = await tx.warehouse.findUnique({ where: { id: anyLevel.warehouseId } });
    }
    if (!wh) continue;
    await tx.stockLevel.upsert({
      where:  { ingredientId_warehouseId: { ingredientId: l.ingredientId, warehouseId: wh.id } },
      create: { ingredientId: l.ingredientId, warehouseId: wh.id, qtyOnHand: 0, qtyReserved: qty, avgCostPen: Number(l.ingredient?.avgCostPen ?? 0) },
      update: { qtyReserved: { increment: qty } },
    });
    await tx.productionReservation.create({
      data: { productionOrderId: orderId, ingredientId: l.ingredientId, warehouseId: wh.id, qty },
    });
  }
}

// Release all still-open reservations of an order (close / cancel).
async function releaseReservations(tx: any, orderId: string) {
  const reservations = await tx.productionReservation.findMany({ where: { productionOrderId: orderId, releasedAt: null } });
  for (const r of reservations) {
    const level = await tx.stockLevel.findUnique({
      where: { ingredientId_warehouseId: { ingredientId: r.ingredientId, warehouseId: r.warehouseId } },
    });
    if (level) {
      const newReserved = level.qtyReserved.sub(r.qty);
      await tx.stockLevel.update({
        where: { ingredientId_warehouseId: { ingredientId: r.ingredientId, warehouseId: r.warehouseId } },
        data:  { qtyReserved: newReserved.lessThan(0) ? 0 : newReserved },
      });
    }
    await tx.productionReservation.update({ where: { id: r.id }, data: { releasedAt: new Date() } });
  }
}

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
      plannedQty: number; scheduledDate: string; line?: string;
      shift?: string; linkedSalesOrderIds?: string[]; notes?: string;
    };
    const recipe = await prisma.recipe.findUnique({
      where:   { id: body.recipeId },
      include: { bomLines: { include: { ingredient: true } } },
    });
    if (!recipe) return reply.code(422).send({ error: 'Receta no encontrada' });
    const scheduled = body.scheduledDate ? new Date(body.scheduledDate) : new Date();
    if (isNaN(scheduled.getTime())) return reply.code(400).send({ error: 'Fecha programada invalida' });
    if (!body.plannedQty || body.plannedQty <= 0) return reply.code(400).send({ error: 'Cantidad planificada invalida' });
    const line = (body.line ?? '').toUpperCase();
    if (!['A', 'B', 'C'].includes(line)) return reply.code(400).send({ error: 'Línea de producción inválida (A, B o C)' });

    // Lot number = order number, generated from date + line + batch sequence.
    const orderNumber = await generateLotNumber(scheduled, line);

    const order = await prisma.$transaction(async (tx) => {
      const created = await tx.productionOrder.create({
        data: {
          orderNumber,
          recipeId:            body.recipeId,
          recipeVersion:       recipe.version,
          plannedQty:          body.plannedQty,
          line:                line as never,
          scheduledDate:       scheduled,
          shift:               body.shift ?? null,
          linkedSalesOrderIds: body.linkedSalesOrderIds ?? [],
          notes:               body.notes ?? null,
          status:              'DRAFT',
          createdBy:           req.actor!.sub,
        },
      });
      // Reserve BOM ingredients so they can't be consumed/assigned elsewhere.
      await reserveForOrder(tx, created.id, recipe, Number(body.plannedQty));
      return created;
    });
    return reply.code(201).send({ data: order });
  });

  app.patch('/orders/:id/status', { preHandler: [requireAnyOf('PRODUCTION', 'OPS_MGR')] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const { status } = req.body as { status: string };
    // Cancelling frees the reserved inventory.
    if (status === 'CANCELLED') {
      await releaseReservations(prisma, id);
    }
    const order = await prisma.productionOrder.update({
      where: { id }, data: { status: status as never,
        ...(status === 'IN_PROGRESS' ? { startedAt: new Date() } : {}),
        ...(status === 'COMPLETED'   ? { completedAt: new Date() } : {}),
      },
    });
    return reply.send({ data: order });
  });

  // ── Recipe READ endpoints ─────────────────────────────────────────────────

  app.get('/recipes', { preHandler: [requireAnyOf('OPS_MGR', 'PRODUCTION')] }, async (req, reply) => {
    // Optional filters: productId (so each product shows ITS own recipe, not a
    // shared "base" one) and status (defaults to ACTIVE).
    const q = req.query as { productId?: string; status?: string };
    const recipes = await prisma.recipe.findMany({
      where: {
        status: (q.status as never) ?? ('ACTIVE' as never),
        ...(q.productId ? { productId: q.productId } : {}),
      },
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

    // Release this order's reservations first, so its own consumption isn't
    // blocked by the stock it had reserved.
    await releaseReservations(prisma, order.id);

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

  // ── Shop-floor tablet: per-stage time tracking ───────────────────────────
  // Stages: DOSIFICADO, AMASADO, PORCIONADO, REPOSO, BOLEADO, LABRADO,
  //         FERMENTADO, REPOSO_FRIO, PREPARACION, HORNEADO, ENFRIADO, ENVASADO

  const STAGES = [
    'DOSIFICADO','AMASADO','PORCIONADO','REPOSO','BOLEADO','LABRADO',
    'FERMENTADO','REPOSO_FRIO','PREPARACION','HORNEADO','ENFRIADO','ENVASADO',
  ];

  // List stage logs for an order.
  app.get('/orders/:id/stages', { preHandler: [requireAnyOf('PRODUCTION', 'OPS_MGR', 'SUPER_ADMIN')] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const logs = await (prisma as any).productionStageLog.findMany({
      where:   { productionOrderId: id },
      orderBy: { startedAt: 'asc' },
    });
    return reply.send({ data: logs });
  });

  // Start / end / update a stage. Body: { stage, action: 'START'|'END'|'UPDATE',
  // quantity?, leftover?, notes? }
  app.post('/orders/:id/stages', { preHandler: [requireAnyOf('PRODUCTION', 'OPS_MGR', 'SUPER_ADMIN')] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as { stage: string; action?: string; quantity?: number; leftover?: number; notes?: string };
    const stage = (body.stage ?? '').toUpperCase();
    if (!STAGES.includes(stage)) return reply.code(400).send({ error: 'Etapa inválida' });
    const action = (body.action ?? 'UPDATE').toUpperCase();

    const existing = await (prisma as any).productionStageLog.findUnique({
      where: { productionOrderId_stage: { productionOrderId: id, stage: stage as never } },
    });

    const data: any = {};
    if (body.quantity !== undefined) data.quantity = body.quantity;
    if (body.leftover !== undefined) data.leftover = body.leftover;
    if (body.notes    !== undefined) data.notes    = body.notes;

    if (action === 'START') {
      data.startedAt = new Date();
      data.endedAt   = null;
      data.durationSec = null;
    } else if (action === 'END') {
      const startedAt = existing?.startedAt ?? new Date();
      const endedAt   = new Date();
      data.startedAt  = startedAt;
      data.endedAt    = endedAt;
      data.durationSec = Math.max(0, Math.round((endedAt.getTime() - new Date(startedAt).getTime()) / 1000));
    }

    const log = await (prisma as any).productionStageLog.upsert({
      where:  { productionOrderId_stage: { productionOrderId: id, stage: stage as never } },
      create: { productionOrderId: id, stage: stage as never, createdBy: req.actor!.sub, ...data },
      update: { ...data },
    });
    return reply.send({ data: log });
  });
}
