import type { FastifyInstance } from 'fastify';
import { requireAnyOf } from '../../middleware/auth';
import { prisma } from '../../lib/prisma';
import { notifyPurchaseOrderCreated } from '../../services/notifications';

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
    const body = req.body as { supplierId: string; lines: { ingredientId: string; qtyOrdered: number; uom: string; unitPrice: number }[]; expectedDeliveryDate?: string; notes?: string };
    const subtotal = body.lines.reduce((sum, l) => sum + l.qtyOrdered * l.unitPrice, 0);
    const igv = parseFloat((subtotal * 0.18).toFixed(4));
    const po = await prisma.purchaseOrder.create({
      data: {
        poNumber: `PO-${Date.now()}`, supplierId: body.supplierId,
        subtotalPen: subtotal, igvPen: igv, totalPen: subtotal + igv,
        expectedDeliveryDate: body.expectedDeliveryDate ? new Date(body.expectedDeliveryDate) : undefined,
        notes: body.notes, createdBy: req.actor!.sub,
        lines: { create: body.lines.map(l => ({ ...l, lineTotalPen: l.qtyOrdered * l.unitPrice })) },
      },
      include: { lines: true, supplier: true },
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
    const { approved, reason } = req.body as { approved: boolean; reason?: string };
    const po = await prisma.purchaseOrder.update({
      where: { id },
      data: { status: approved ? 'APPROVED' : 'CANCELLED', approvedBy: req.actor!.sub, approvedAt: new Date(), notes: reason },
    });
    return reply.send({ data: po });
  });

  app.get('/suppliers', { preHandler: [requireAnyOf('PROCUREMENT', 'OPS_MGR', 'FINANCE_MGR')] }, async (_req, reply) => {
    const suppliers = await prisma.supplier.findMany({ where: { isActive: true }, orderBy: { businessName: 'asc' } });
    return reply.send({ data: suppliers });
  });

  app.post('/suppliers', { preHandler: [requireAnyOf('PROCUREMENT')] }, async (req, reply) => {
    const body = req.body as { businessName: string; ruc: string; contactName?: string; email?: string; phone?: string; paymentTermsDays?: number };
    const supplier = await prisma.supplier.create({ data: body });
    return reply.code(201).send({ data: supplier });
  });

  app.patch('/suppliers/:id', { preHandler: [requireAnyOf('PROCUREMENT', 'OPS_MGR', 'SUPER_ADMIN')] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const supplier = await prisma.supplier.update({ where: { id }, data: req.body as never });
    return reply.send({ data: supplier });
  });
}
