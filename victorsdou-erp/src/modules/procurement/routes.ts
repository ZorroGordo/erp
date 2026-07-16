import type { FastifyInstance } from 'fastify';
import { requireAnyOf } from '../../middleware/auth';
import { prisma } from '../../lib/prisma';
import { notifyPurchaseOrderCreated } from '../../services/notifications';

// Convert '' / null / undefined to null; otherwise coerce to a finite number.
function toNumberOrNull(v: unknown): number | null {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// Whitelist + coerce the supplier form payload to valid Supplier columns. The
// UI sends extra/empty fields (cci, creditLimit, detracción…) that must be
// mapped to the right types, otherwise Prisma rejects the whole create.
function normalizeSupplierBody(b: any) {
  return {
    businessName:       b.businessName,
    ruc:                b.ruc,
    contactName:        b.contactName || null,
    email:              b.email || null,
    phone:              b.phone || null,
    address:            b.address || null,
    paymentTermsDays:   b.paymentTermsDays != null && b.paymentTermsDays !== '' ? Number(b.paymentTermsDays) : 30,
    paymentDayOfMonth:  b.paymentDayOfMonth || null,
    paymentMethod:      b.paymentMethod || null,
    bankName:           b.bankName || null,
    bankAccount:        b.bankAccount || null,
    cci:                b.cci || null,
    creditLimit:        toNumberOrNull(b.creditLimit),
    currency:           b.currency || 'PEN',
    requiresDetraccion: !!b.requiresDetraccion,
    detraccionRate:     toNumberOrNull(b.detraccionRate),
    notes:              b.notes || null,
  };
}

export async function procurementRoutes(app: FastifyInstance) {
  app.get('/purchase-orders', { preHandler: [requireAnyOf('PROCUREMENT', 'OPS_MGR', 'FINANCE_MGR')] }, async (req, reply) => {
    const q = req.query as { status?: string; supplierId?: string; search?: string; limit?: string };
    const take = q.limit ? Math.min(parseInt(q.limit), 100) : undefined;
    const where: any = {
      ...(q.status     ? { status: q.status as never } : {}),
      ...(q.supplierId ? { supplierId: q.supplierId }  : {}),
      ...(q.search ? {
        OR: [
          { poNumber:  { contains: q.search, mode: 'insensitive' } },
          { supplier:  { businessName: { contains: q.search, mode: 'insensitive' } } },
          { supplier:  { ruc: { contains: q.search } } },
        ],
      } : {}),
    };
    const orders = await prisma.purchaseOrder.findMany({
      where,
      take,
      include: { supplier: { select: { id: true, businessName: true, ruc: true } }, lines: { include: { ingredient: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return reply.send({ data: orders });
  });

  app.post('/purchase-orders', { preHandler: [requireAnyOf('PROCUREMENT')] }, async (req, reply) => {
    const body = req.body as {
      supplierId: string;
      currency?: string;
      exchangeRate?: number;
      lines: { ingredientId: string; qtyOrdered?: number; quantity?: number; uom?: string; unitPrice?: number; unitPricePen?: number }[];
      expectedDeliveryDate?: string;
      notes?: string;
    };

    if (!body.supplierId) return reply.code(400).send({ error: 'supplierId es requerido' });

    // Currency of the order. Line prices are entered in this currency; totals are
    // always stored in soles using the exchange rate (S/ per foreign unit) so
    // stock valuation stays in soles regardless of the purchase currency.
    const currency = (body.currency || 'PEN').toUpperCase();
    const rate = currency === 'PEN' ? 1 : (Number(body.exchangeRate) || 1);

    // The UI sends { ingredientId, quantity, unitPricePen, uom }; the schema uses
    // qtyOrdered / unitPrice. Map both spellings and coerce to numbers so we never
    // persist NaN (which previously broke the whole create with a misleading
    // "Argument `supplier` is missing" Prisma error). unitPrice is stored in the
    // PO currency; lineTotalPen is the soles-converted line total.
    const lines = (body.lines ?? [])
      .filter(l => l.ingredientId)
      .map(l => {
        const qty   = Number(l.qtyOrdered ?? l.quantity ?? 0) || 0;
        const price = Number(l.unitPrice ?? l.unitPricePen ?? 0) || 0;
        return {
          ingredientId: l.ingredientId,
          qtyOrdered:   qty,
          uom:          l.uom || 'unidad',
          unitPrice:    price,
          lineTotalPen: parseFloat((qty * price * rate).toFixed(4)),
        };
      });

    if (lines.length === 0) return reply.code(400).send({ error: 'La OC debe tener al menos una línea' });

    const subtotal = lines.reduce((sum, l) => sum + l.lineTotalPen, 0);
    const igv = parseFloat((subtotal * 0.18).toFixed(4));
    const po = await prisma.purchaseOrder.create({
      data: {
        poNumber: `PO-${Date.now()}`, supplierId: body.supplierId,
        currency, exchangeRate: rate,
        subtotalPen: subtotal, igvPen: igv, totalPen: parseFloat((subtotal + igv).toFixed(4)),
        expectedDeliveryDate: body.expectedDeliveryDate ? new Date(body.expectedDeliveryDate) : undefined,
        notes: body.notes, createdBy: req.actor!.sub,
        lines: { create: lines },
      },
      include: { lines: { include: { ingredient: true } }, supplier: true },
    });

    // Fire-and-forget: notify supplier + ops
    notifyPurchaseOrderCreated({
      poNumber: po.poNumber,
      totalPen: Number(po.totalPen),
      supplier: { businessName: po.supplier.businessName, email: (po.supplier as any).email ?? null },
    }).catch(console.error);

    return reply.code(201).send({ data: po });
  });

  app.patch('/purchase-orders/:id/approve', { preHandler: [requireAnyOf('OPS_MGR', 'FINANCE_MGR')] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const { approved, reason } = (req.body ?? {}) as { approved?: boolean; reason?: string };
    // Default to approving: this endpoint is the "Aprobar" action, so an empty
    // body must approve — previously undefined fell through to CANCELLED.
    const isApproved = approved !== false;
    const po = await prisma.purchaseOrder.update({
      where: { id },
      data: {
        status: isApproved ? 'APPROVED' : 'CANCELLED',
        approvedBy: req.actor!.sub,
        approvedAt: new Date(),
        ...(reason ? { notes: reason } : {}),
      },
    });
    return reply.send({ data: po });
  });

  // ── PATCH /purchase-orders/:id — edit a DRAFT order (supplier, lines, currency) ─
  app.patch('/purchase-orders/:id', { preHandler: [requireAnyOf('PROCUREMENT', 'OPS_MGR')] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as {
      supplierId?: string;
      currency?: string;
      exchangeRate?: number;
      expectedDeliveryDate?: string | null;
      notes?: string | null;
      lines?: { ingredientId: string; qtyOrdered?: number; quantity?: number; uom?: string; unitPrice?: number; unitPricePen?: number }[];
    };

    const existing = await prisma.purchaseOrder.findUnique({ where: { id } });
    if (!existing) return reply.code(404).send({ error: 'OC no encontrada' });
    if (existing.status !== 'DRAFT') {
      return reply.code(422).send({ error: 'Solo se pueden editar órdenes en borrador' });
    }

    const currency = (body.currency || existing.currency || 'PEN').toUpperCase();
    const rate = currency === 'PEN' ? 1 : (Number(body.exchangeRate) || Number(existing.exchangeRate) || 1);

    const data: any = {
      ...(body.supplierId ? { supplierId: body.supplierId } : {}),
      currency,
      exchangeRate: rate,
      ...(body.expectedDeliveryDate !== undefined
        ? { expectedDeliveryDate: body.expectedDeliveryDate ? new Date(body.expectedDeliveryDate) : null }
        : {}),
      ...(body.notes !== undefined ? { notes: body.notes } : {}),
    };

    // Replace lines atomically when provided, and recompute soles totals.
    if (body.lines) {
      const lines = body.lines
        .filter(l => l.ingredientId)
        .map(l => {
          const qty   = Number(l.qtyOrdered ?? l.quantity ?? 0) || 0;
          const price = Number(l.unitPrice ?? l.unitPricePen ?? 0) || 0;
          return {
            ingredientId: l.ingredientId,
            qtyOrdered:   qty,
            uom:          l.uom || 'unidad',
            unitPrice:    price,
            lineTotalPen: parseFloat((qty * price * rate).toFixed(4)),
          };
        });
      if (lines.length === 0) return reply.code(400).send({ error: 'La OC debe tener al menos una línea' });
      const subtotal = lines.reduce((s, l) => s + l.lineTotalPen, 0);
      const igv = parseFloat((subtotal * 0.18).toFixed(4));
      data.subtotalPen = subtotal;
      data.igvPen = igv;
      data.totalPen = parseFloat((subtotal + igv).toFixed(4));
      await prisma.purchaseOrderLine.deleteMany({ where: { purchaseOrderId: id } });
      data.lines = { create: lines };
    }

    const po = await prisma.purchaseOrder.update({
      where: { id },
      data,
      include: { lines: { include: { ingredient: true } }, supplier: true },
    });
    return reply.send({ data: po });
  });

  app.get('/suppliers', { preHandler: [requireAnyOf('PROCUREMENT', 'OPS_MGR', 'FINANCE_MGR')] }, async (_req, reply) => {
    const suppliers = await prisma.supplier.findMany({ where: { isActive: true }, orderBy: { businessName: 'asc' } });
    return reply.send({ data: suppliers });
  });

  app.post('/suppliers', { preHandler: [requireAnyOf('PROCUREMENT')] }, async (req, reply) => {
    const body = req.body as any;
    if (!body?.businessName || !body?.ruc) {
      return reply.code(400).send({ error: 'Razón social y RUC son requeridos' });
    }
    const supplier = await prisma.supplier.create({ data: normalizeSupplierBody(body) });
    return reply.code(201).send({ data: supplier });
  });

  app.patch('/suppliers/:id', { preHandler: [requireAnyOf('PROCUREMENT', 'OPS_MGR', 'SUPER_ADMIN')] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    // Never change the RUC on edit (unique identity); drop it from the update.
    const { ruc: _ruc, ...rest } = normalizeSupplierBody(req.body as any);
    const supplier = await prisma.supplier.update({ where: { id }, data: rest });
    return reply.send({ data: supplier });
  });
}
