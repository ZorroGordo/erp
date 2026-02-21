import type { FastifyInstance } from 'fastify';
import { requireAnyOf } from '../../middleware/auth';
import { setAuditContext } from '../../middleware/audit';
import * as InventoryService from './service';

export async function inventoryRoutes(app: FastifyInstance) {

  // ── GET /v1/inventory/dashboard — per-ingredient totals + alert config ──────
  app.get('/dashboard', {
    preHandler: [requireAnyOf('WAREHOUSE', 'OPS_MGR', 'PRODUCTION', 'PROCUREMENT', 'FINANCE_MGR', 'SUPER_ADMIN')],
  }, async (_req, reply) => {
    const data = await InventoryService.getDashboardData();
    return reply.send({ data });
  });

  // ── GET /v1/inventory/ingredients — stock levels (original, per warehouse) ──
  app.get('/ingredients', {
    preHandler: [requireAnyOf('WAREHOUSE', 'OPS_MGR', 'PRODUCTION', 'PROCUREMENT', 'FINANCE_MGR', 'SUPER_ADMIN')],
  }, async (req, reply) => {
    const { warehouseId } = req.query as { warehouseId?: string };
    const levels = await InventoryService.getStockLevels(warehouseId);
    return reply.send({ data: levels });
  });


  // -- POST /v1/inventory/ingredients -- create a new ingredient master record
  app.post('/ingredients', {
    preHandler: [requireAnyOf('OPS_MGR', 'WAREHOUSE', 'SUPER_ADMIN')],
  }, async (req, reply) => {
    const body = req.body as {
      sku: string;
      name: string;
      category: string;
      baseUom: string;
      avgCostPen?: number;
      isPerishable?: boolean;
      shelfLifeDays?: number;
      allergenFlags?: string[];
    };
    const { prisma } = await import('../../lib/prisma');
    const ingredient = await prisma.ingredient.create({
      data: {
        sku:           body.sku.toUpperCase(),
        name:          body.name,
        category:      body.category,
        baseUom:       body.baseUom,
        avgCostPen:    body.avgCostPen  ?? 0,
        isPerishable:  body.isPerishable ?? false,
        shelfLifeDays: body.shelfLifeDays ?? null,
        allergenFlags: body.allergenFlags ?? [],
      },
    });
    return reply.code(201).send({ data: ingredient });
  });

  // ── GET /v1/inventory/ingredients/:id/movements ──────────────────────────────
  app.get('/ingredients/:id/movements', {
    preHandler: [requireAnyOf('WAREHOUSE', 'OPS_MGR', 'SUPER_ADMIN')],
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const query = req.query as { page?: string; pageSize?: string };
    const result = await InventoryService.getMovementHistory(id, {
      page:     parseInt(query.page ?? '1'),
      pageSize: parseInt(query.pageSize ?? '50'),
    });
    return reply.send({ data: result.movements, meta: { total: result.total } });
  });

  // ── GET /v1/inventory/ingredients/:id/receipts ───────────────────────────────
  app.get('/ingredients/:id/receipts', {
    preHandler: [requireAnyOf('WAREHOUSE', 'OPS_MGR', 'PROCUREMENT', 'SUPER_ADMIN')],
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const query = req.query as { page?: string; pageSize?: string };
    const result = await InventoryService.getReceiptHistory(
      id,
      parseInt(query.page ?? '1'),
      parseInt(query.pageSize ?? '50'),
    );
    return reply.send({ data: result.receipts, meta: { total: result.total } });
  });

  // ── PUT /v1/inventory/ingredients/:id/alert-settings ─────────────────────────
  app.put('/ingredients/:id/alert-settings', {
    preHandler: [requireAnyOf('WAREHOUSE', 'OPS_MGR', 'SUPER_ADMIN')],
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as {
      alertThreshold: number;
      minThreshold:   number;
      alertEmails:    string[];
      dashboardUnit:  string;
    };
    const cfg = await InventoryService.upsertAlertConfig(
      id,
      body.alertThreshold ?? 0,
      body.minThreshold   ?? 0,
      body.alertEmails    ?? [],
      body.dashboardUnit  ?? 'qty',
    );
    return reply.send({ data: cfg });
  });

  // ── POST /v1/inventory/receipts — register incoming stock with invoice/PO ref
  app.post('/receipts', {
    preHandler: [requireAnyOf('WAREHOUSE', 'OPS_MGR', 'PROCUREMENT', 'SUPER_ADMIN')],
  }, async (req, reply) => {
    const body = req.body as {
      ingredientId: string;
      warehouseId:  string;
      qty:          number;
      unitCost:     number;
      invoiceRef?:  string;
      poRef?:       string;
      notes?:       string;
    };

    setAuditContext(req, 'inventory', 'PURCHASE_RECEIPT', body.ingredientId);

    await InventoryService.registerReceipt({
      ...body,
      createdBy: req.actor!.sub,
    });

    return reply.code(201).send({ data: { success: true } });
  });

  // ── GET /v1/inventory/warehouses — list all active warehouses ───────────────
  app.get('/warehouses', {
    preHandler: [requireAnyOf('WAREHOUSE', 'OPS_MGR', 'PRODUCTION', 'PROCUREMENT', 'FINANCE_MGR', 'SUPER_ADMIN')],
  }, async (_req, reply) => {
    const { prisma } = await import('../../lib/prisma');
    const warehouses = await prisma.warehouse.findMany({
      where:   { isActive: true },
      orderBy: { name: 'asc' },
    });
    return reply.send({ data: warehouses });
  });

  // ── GET /v1/inventory/reorder-alerts ─────────────────────────────────────────
  app.get('/reorder-alerts', {
    preHandler: [requireAnyOf('OPS_MGR', 'PROCUREMENT', 'FINANCE_MGR', 'SUPER_ADMIN')],
  }, async (_req, reply) => {
    const alerts = await InventoryService.getReorderAlerts();
    return reply.send({ data: alerts });
  });

  // ── GET /v1/inventory/batches/expiry-alerts ───────────────────────────────────
  app.get('/batches/expiry-alerts', {
    preHandler: [requireAnyOf('WAREHOUSE', 'OPS_MGR', 'SUPER_ADMIN')],
  }, async (req, reply) => {
    const { days } = req.query as { days?: string };
    const alerts = await InventoryService.getExpiryAlerts(parseInt(days ?? '7'));
    return reply.send({ data: alerts });
  });

  // ── POST /v1/inventory/movements — manual stock adjustment ───────────────────
  app.post('/movements', {
    preHandler: [requireAnyOf('WAREHOUSE', 'OPS_MGR', 'SUPER_ADMIN')],
  }, async (req, reply) => {
    const body = req.body as {
      type:         'ADJUSTMENT' | 'OPENING_BALANCE';
      ingredientId: string;
      warehouseId:  string;
      direction:    'IN' | 'OUT';
      qty:          number;
      unitCost:     number;
      notes?:       string;
    };

    setAuditContext(req, 'inventory', 'ADJUSTMENT', body.ingredientId);

    if (body.direction === 'IN') {
      await InventoryService.recordStockIn({
        type:         body.type as never,
        ingredientId: body.ingredientId,
        warehouseId:  body.warehouseId,
        qty:          body.qty,
        unitCost:     body.unitCost,
        notes:        body.notes,
        createdBy:    req.actor!.sub,
      });
    } else {
      await InventoryService.recordStockOut({
        type:         body.type as never,
        ingredientId: body.ingredientId,
        warehouseId:  body.warehouseId,
        qty:          body.qty,
        unitCost:     body.unitCost,
        notes:        body.notes,
        createdBy:    req.actor!.sub,
      });
    }

    return reply.code(201).send({ data: { success: true } });
  });
}
