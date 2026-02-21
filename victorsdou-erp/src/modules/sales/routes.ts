import type { FastifyInstance } from 'fastify';
import { requireAnyOf } from '../../middleware/auth';
import { prisma } from '../../lib/prisma';
import * as SalesService from './service';
import { notifySalesOrderConfirmed } from '../../services/notifications';

export async function salesRoutes(app: FastifyInstance) {
  app.get('/', { preHandler: [requireAnyOf('SALES_AGENT', 'SALES_MGR', 'OPS_MGR', 'FINANCE_MGR')] }, async (req, reply) => {
    const q = req.query as { status?: string; customerId?: string };
    const orders = await prisma.salesOrder.findMany({
      where: { ...(q.status ? { status: q.status as never } : {}), ...(q.customerId ? { customerId: q.customerId } : {}) },
      include: { customer: true, lines: { include: { product: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return reply.send({ data: orders });
  });

  app.get('/:id/price-preview', { preHandler: [requireAnyOf('SALES_AGENT', 'SALES_MGR')] }, async (req, reply) => {
    const { customerId, lines } = req.body as { customerId: string; lines: { productId: string; qty: number }[] };
    const preview = await SalesService.previewOrderPricing(customerId, lines);
    return reply.send({ data: preview });
  });

  app.post('/', { preHandler: [requireAnyOf('SALES_AGENT', 'SALES_MGR')] }, async (req, reply) => {
    const body = req.body as Parameters<typeof SalesService.createOrder>[0];
    const order = await SalesService.createOrder({ ...body, createdBy: req.actor!.sub });
    return reply.code(201).send({ data: order });
  });

  app.patch('/:id/confirm', { preHandler: [requireAnyOf('SALES_MGR', 'OPS_MGR')] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const order = await prisma.salesOrder.update({
      where:   { id },
      data:    { status: 'CONFIRMED', confirmedAt: new Date() },
      include: { customer: true },
    });

    // Fire-and-forget: notify customer + ops
    notifySalesOrderConfirmed({
      orderNumber: (order as any).orderNumber ?? id,
      totalPen:    (order as any).totalPen ?? 0,
      customer: {
        businessName: (order as any).customer?.businessName ?? null,
        contactName:  (order as any).customer?.contactName  ?? null,
        email:        (order as any).customer?.email        ?? null,
      },
    }).catch(console.error);

    return reply.send({ data: order });
  });

  app.patch('/:id/cancel', { preHandler: [requireAnyOf('SALES_MGR', 'OPS_MGR')] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const { reason } = req.body as { reason?: string };
    const order = await prisma.salesOrder.update({
      where: { id }, data: { status: 'CANCELLED', notes: reason },
    });
    return reply.send({ data: order });
  });
}
