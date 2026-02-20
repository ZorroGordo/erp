import { Prisma, StockMovementType } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { eventBus } from '../../lib/event-bus';
import type { WACUpdateInput } from '../../types';
import { sendEmail, buildStockAlertEmail } from '../../lib/email';

// ── WAC (Weighted Average Cost) Engine ───────────────────────────────────────

/**
 * Recalculates the Weighted Average Cost for an ingredient in a warehouse
 * after a purchase receipt.
 *
 * Formula: new_avg = (qty_on_hand × current_avg + qty_added × unit_cost)
 *                  / (qty_on_hand + qty_added)
 *
 * This must run inside a transaction to prevent concurrent updates.
 */
export async function updateWAC(
  input: WACUpdateInput,
  tx: Prisma.TransactionClient,
): Promise<{ newAvgCost: Prisma.Decimal; newQtyOnHand: Prisma.Decimal }> {
  const level = await tx.stockLevel.findUnique({
    where: {
      ingredientId_warehouseId: {
        ingredientId: input.ingredientId,
        warehouseId:  input.warehouseId,
      },
    },
  });

  const currentQty     = level?.qtyOnHand     ?? new Prisma.Decimal(0);
  const currentAvgCost = level?.avgCostPen     ?? new Prisma.Decimal(0);
  const addedQty       = new Prisma.Decimal(input.qtyAdded);
  const addedCost      = new Prisma.Decimal(input.unitCost);

  const totalQty   = currentQty.add(addedQty);
  const newAvgCost = totalQty.greaterThan(0)
    ? currentQty.mul(currentAvgCost).add(addedQty.mul(addedCost)).div(totalQty)
    : addedCost;

  await tx.stockLevel.upsert({
    where: {
      ingredientId_warehouseId: {
        ingredientId: input.ingredientId,
        warehouseId:  input.warehouseId,
      },
    },
    create: {
      ingredientId:  input.ingredientId,
      warehouseId:   input.warehouseId,
      qtyOnHand:     addedQty,
      qtyReserved:   0,
      avgCostPen:    newAvgCost,
      lastMovementAt: new Date(),
    },
    update: {
      qtyOnHand:     totalQty,
      avgCostPen:    newAvgCost,
      lastMovementAt: new Date(),
    },
  });

  // Update global ingredient average cost
  await tx.ingredient.update({
    where: { id: input.ingredientId },
    data:  { avgCostPen: newAvgCost },
  });

  return { newAvgCost, newQtyOnHand: totalQty };
}

// ── Stock Movement ────────────────────────────────────────────────────────────

interface MovementInput {
  type:          StockMovementType;
  ingredientId:  string;
  warehouseId:   string;
  qty:           number;   // positive for in, positive for out (direction inferred by type)
  unitCost:      number;
  refDocType?:   string;
  refDocId?:     string;
  batchId?:      string;
  notes?:        string;
  createdBy:     string;
}

export async function recordStockIn(input: MovementInput): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const { newAvgCost, newQtyOnHand } = await updateWAC(
      { ingredientId: input.ingredientId, warehouseId: input.warehouseId,
        qtyAdded: input.qty, unitCost: input.unitCost },
      tx,
    );

    await tx.stockMovement.create({
      data: {
        type:        input.type,
        refDocType:  input.refDocType,
        refDocId:    input.refDocId,
        ingredientId:input.ingredientId,
        warehouseId: input.warehouseId,
        batchId:     input.batchId,
        qtyIn:       input.qty,
        qtyOut:      0,
        unitCostPen: input.unitCost,
        totalCostPen:new Prisma.Decimal(input.qty).mul(new Prisma.Decimal(input.unitCost)),
        balanceAfter:newQtyOnHand,
        notes:       input.notes,
        createdBy:   input.createdBy,
      },
    });
  });

  // Check reorder point after stock in (safety net)
  await checkReorderAlert(input.ingredientId, input.warehouseId);
}

export async function recordStockOut(input: MovementInput): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const level = await tx.stockLevel.findUnique({
      where: {
        ingredientId_warehouseId: {
          ingredientId: input.ingredientId,
          warehouseId:  input.warehouseId,
        },
      },
    });

    if (!level) {
      throw Object.assign(new Error('Ingredient not found in warehouse'), {
        statusCode: 422, code: 'INSUFFICIENT_STOCK',
      });
    }

    const available = level.qtyOnHand.sub(level.qtyReserved);
    if (available.lessThan(new Prisma.Decimal(input.qty))) {
      throw Object.assign(
        new Error(`Insufficient stock. Available: ${available}, Requested: ${input.qty}`),
        { statusCode: 422, code: 'INSUFFICIENT_STOCK' },
      );
    }

    const newQty = level.qtyOnHand.sub(new Prisma.Decimal(input.qty));

    await tx.stockLevel.update({
      where: {
        ingredientId_warehouseId: {
          ingredientId: input.ingredientId,
          warehouseId:  input.warehouseId,
        },
      },
      data: { qtyOnHand: newQty, lastMovementAt: new Date() },
    });

    await tx.stockMovement.create({
      data: {
        type:        input.type,
        refDocType:  input.refDocType,
        refDocId:    input.refDocId,
        ingredientId:input.ingredientId,
        warehouseId: input.warehouseId,
        batchId:     input.batchId,
        qtyIn:       0,
        qtyOut:      input.qty,
        unitCostPen: level.avgCostPen,
        totalCostPen:new Prisma.Decimal(input.qty).mul(level.avgCostPen),
        balanceAfter:newQty,
        notes:       input.notes,
        createdBy:   input.createdBy,
      },
    });
  });

  await checkReorderAlert(input.ingredientId, input.warehouseId);
}

// ── Stock Reservation ─────────────────────────────────────────────────────────

export async function reserveStock(
  ingredientId: string,
  warehouseId:  string,
  qty:          number,
): Promise<void> {
  await prisma.stockLevel.updateMany({
    where: { ingredientId, warehouseId },
    data:  { qtyReserved: { increment: qty } },
  });
}

export async function releaseReservation(
  ingredientId: string,
  warehouseId:  string,
  qty:          number,
): Promise<void> {
  await prisma.stockLevel.updateMany({
    where: { ingredientId, warehouseId },
    data:  { qtyReserved: { decrement: qty } },
  });
}

// ── Reorder Alert ─────────────────────────────────────────────────────────────

const ALERT_THROTTLE_HOURS = 6; // min hours between repeated emails

async function checkReorderAlert(
  ingredientId: string,
  warehouseId:  string,
): Promise<void> {
  const [level, rule, alertCfg] = await Promise.all([
    prisma.stockLevel.findUnique({
      where: { ingredientId_warehouseId: { ingredientId, warehouseId } },
    }),
    prisma.reorderRule.findUnique({
      where: { ingredientId_warehouseId: { ingredientId, warehouseId } },
    }),
    (prisma as any).ingredientAlert?.findUnique({ where: { ingredientId } })
      .catch(() => null) as Promise<any>,
  ]);

  if (!level) return;

  const available = level.qtyOnHand.sub(level.qtyReserved);

  // Standard reorder rule event
  if (rule && available.lessThanOrEqualTo(rule.reorderPoint)) {
    eventBus.emit('stock.low', {
      ingredientId,
      warehouseId,
      qtyAvailable: available.toNumber(),
    });
  }

  // Custom alert config — send emails if configured
  if (!alertCfg || !alertCfg.alertEmails?.length) return;

  const ing = await prisma.ingredient.findUnique({ where: { id: ingredientId } });
  if (!ing) return;

  const qty  = available.toNumber();
  const now  = new Date();
  const throttleMs = ALERT_THROTTLE_HOURS * 60 * 60 * 1000;

  // Critical (below minThreshold)
  const minThreshold = Number(alertCfg.minThreshold);
  if (minThreshold > 0 && qty <= minThreshold) {
    const lastMin = alertCfg.lastMinAlertAt ? new Date(alertCfg.lastMinAlertAt).getTime() : 0;
    if (now.getTime() - lastMin > throttleMs) {
      const { subject, html } = buildStockAlertEmail({
        ingredientName: ing.name,
        qtyAvailable:   qty,
        uom:            ing.baseUom,
        level:          'critical',
        threshold:      minThreshold,
      });
      await sendEmail({ to: alertCfg.alertEmails, subject, html });
      await (prisma as any).ingredientAlert.update({
        where: { ingredientId },
        data:  { lastMinAlertAt: now },
      });
    }
    return; // don't also send the warn-level email
  }

  // Warning (below alertThreshold)
  const alertThreshold = Number(alertCfg.alertThreshold);
  if (alertThreshold > 0 && qty <= alertThreshold) {
    const lastAlert = alertCfg.lastAlertAt ? new Date(alertCfg.lastAlertAt).getTime() : 0;
    if (now.getTime() - lastAlert > throttleMs) {
      const { subject, html } = buildStockAlertEmail({
        ingredientName: ing.name,
        qtyAvailable:   qty,
        uom:            ing.baseUom,
        level:          'alert',
        threshold:      alertThreshold,
      });
      await sendEmail({ to: alertCfg.alertEmails, subject, html });
      await (prisma as any).ingredientAlert.update({
        where: { ingredientId },
        data:  { lastAlertAt: now },
      });
    }
  }
}

// ── Queries ───────────────────────────────────────────────────────────────────

export async function getStockLevels(warehouseId?: string) {
  return prisma.stockLevel.findMany({
    where:   warehouseId ? { warehouseId } : undefined,
    include: { ingredient: true, warehouse: true },
    orderBy: { ingredient: { name: 'asc' } },
  });
}

// ── Dashboard — per-ingredient totals ─────────────────────────────────────────

export async function getDashboardData() {
  const ingredients = await prisma.ingredient.findMany({
    where:   { isActive: true },
    include: {
      stockLevels: { include: { warehouse: true } },
      alertConfig: true,
    },
    orderBy: { name: 'asc' },
  });

  return ingredients.map((ing) => {
    const totalQty      = ing.stockLevels.reduce((s, sl) => s + Number(sl.qtyOnHand), 0);
    const totalReserved = ing.stockLevels.reduce((s, sl) => s + Number(sl.qtyReserved), 0);
    const available     = totalQty - totalReserved;
    const alertThreshold  = Number(ing.alertConfig?.alertThreshold ?? 0);
    const minThreshold    = Number(ing.alertConfig?.minThreshold    ?? 0);

    let status: 'ok' | 'alert' | 'critical' = 'ok';
    if (minThreshold > 0 && available <= minThreshold)         status = 'critical';
    else if (alertThreshold > 0 && available <= alertThreshold) status = 'alert';

    return {
      id:             ing.id,
      name:           ing.name,
      sku:            ing.sku,
      category:       ing.category,
      baseUom:        ing.baseUom,
      avgCostPen:     Number(ing.avgCostPen),
      totalQty,
      totalReserved,
      available,
      status,
      alertConfig:    ing.alertConfig,
      warehouses:     ing.stockLevels.map((sl) => ({
        warehouseId:   sl.warehouseId,
        warehouseName: sl.warehouse.name,
        qty:           Number(sl.qtyOnHand),
        reserved:      Number(sl.qtyReserved),
      })),
    };
  });
}

// ── Alert-settings CRUD ───────────────────────────────────────────────────────

export async function upsertAlertConfig(
  ingredientId:    string,
  alertThreshold:  number,
  minThreshold:    number,
  alertEmails:     string[],
  dashboardUnit:   string,
) {
  return (prisma as any).ingredientAlert.upsert({
    where:  { ingredientId },
    create: { ingredientId, alertThreshold, minThreshold, alertEmails, dashboardUnit },
    update: { alertThreshold, minThreshold, alertEmails, dashboardUnit },
  });
}

// ── Receipt registration (PURCHASE_RECEIPT with invoice+PO refs) ──────────────

export async function registerReceipt(input: {
  ingredientId: string;
  warehouseId:  string;
  qty:          number;
  unitCost:     number;
  invoiceRef?:  string;
  poRef?:       string;
  notes?:       string;
  createdBy:    string;
}) {
  const notesParts: string[] = [];
  if (input.invoiceRef) notesParts.push(`Factura: ${input.invoiceRef}`);
  if (input.poRef)      notesParts.push(`OC: ${input.poRef}`);
  if (input.notes)      notesParts.push(input.notes);

  await recordStockIn({
    type:         'PURCHASE_RECEIPT',
    ingredientId: input.ingredientId,
    warehouseId:  input.warehouseId,
    qty:          input.qty,
    unitCost:     input.unitCost,
    refDocType:   input.invoiceRef ? 'invoice' : undefined,
    refDocId:     input.invoiceRef ?? undefined,
    notes:        notesParts.join(' | ') || undefined,
    createdBy:    input.createdBy,
  });
}

// ── Receipt history (all PURCHASE_RECEIPT movements for an ingredient) ─────────

export async function getReceiptHistory(ingredientId: string, page = 1, pageSize = 50) {
  const skip = (page - 1) * pageSize;
  const [receipts, total] = await Promise.all([
    prisma.stockMovement.findMany({
      where:   { ingredientId, type: 'PURCHASE_RECEIPT' },
      orderBy: { createdAt: 'desc' },
      skip,
      take:    pageSize,
      include: { warehouse: true },
    }),
    prisma.stockMovement.count({ where: { ingredientId, type: 'PURCHASE_RECEIPT' } }),
  ]);
  return { receipts, total };
}

export async function getMovementHistory(
  ingredientId: string,
  opts: { page: number; pageSize: number },
) {
  const skip = (opts.page - 1) * opts.pageSize;
  const [movements, total] = await Promise.all([
    prisma.stockMovement.findMany({
      where:   { ingredientId },
      orderBy: { createdAt: 'desc' },
      skip,
      take:    opts.pageSize,
      include: { ingredient: true, warehouse: true, batch: true },
    }),
    prisma.stockMovement.count({ where: { ingredientId } }),
  ]);
  return { movements, total };
}

export async function getReorderAlerts() {
  const rules = await prisma.reorderRule.findMany({
    include: { ingredient: true, warehouse: true },
  });

  const alerts = await Promise.all(
    rules.map(async (rule) => {
      const level = await prisma.stockLevel.findUnique({
        where: {
          ingredientId_warehouseId: {
            ingredientId: rule.ingredientId,
            warehouseId:  rule.warehouseId,
          },
        },
      });
      const available = level
        ? level.qtyOnHand.sub(level.qtyReserved)
        : new Prisma.Decimal(0);
      return {
        ingredient:     rule.ingredient,
        warehouse:      rule.warehouse,
        qtyAvailable:   available,
        reorderPoint:   rule.reorderPoint,
        safetyStock:    rule.safetyStockQty,
        isBelowReorder: available.lessThanOrEqualTo(rule.reorderPoint),
        isBelowSafety:  available.lessThanOrEqualTo(rule.safetyStockQty),
        suggestedOrderQty: rule.maxQty.sub(available),
      };
    }),
  );

  return alerts.filter((a) => a.isBelowReorder);
}

export async function getExpiryAlerts(withinDays = 7) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() + withinDays);

  return prisma.batch.findMany({
    where: {
      expiryDate:   { lte: cutoffDate },
      qtyRemaining: { gt: 0 },
    },
    include: { ingredient: true },
    orderBy: { expiryDate: 'asc' },
  });
}
