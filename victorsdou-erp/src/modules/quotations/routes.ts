import type { FastifyInstance } from 'fastify';
import { requireAnyOf } from '../../middleware/auth';
import { prisma } from '../../lib/prisma';

const IGV_RATE = 0.18;

export async function quotationsRoutes(app: FastifyInstance) {

  // ── List quotations ────────────────────────────────────────────────────────
  app.get('/', { preHandler: [requireAnyOf('SALES_AGENT', 'SALES_MGR', 'OPS_MGR', 'FINANCE_MGR')] }, async (req, reply) => {
    const { status } = req.query as { status?: string };
    const where: any = {};
    if (status) where.status = status;

    const quotations = await prisma.quotation.findMany({
      where,
      include: { lines: true },
      orderBy: { createdAt: 'desc' },
    });
    return reply.send({ data: quotations });
  });

  // ── Get single quotation ──────────────────────────────────────────────────
  app.get('/:id', { preHandler: [requireAnyOf('SALES_AGENT', 'SALES_MGR', 'OPS_MGR', 'FINANCE_MGR')] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const quotation = await prisma.quotation.findUnique({
      where: { id },
      include: { lines: true },
    });
    if (!quotation) return reply.code(404).send({ error: 'NOT_FOUND' });
    return reply.send({ data: quotation });
  });

  // ── Create quotation ──────────────────────────────────────────────────────
  app.post('/', { preHandler: [requireAnyOf('SALES_AGENT', 'SALES_MGR')] }, async (req, reply) => {
    const body = req.body as {
      customerName: string;
      customerEmail?: string;
      customerPhone?: string;
      customerDocNo?: string;
      customerDocType?: string;
      customerId?: string;
      validUntil?: string;
      notes?: string;
      lines: Array<{
        productId?: string;
        productName: string;
        qty: number;
        unitPrice: number;
        notes?: string;
      }>;
    };

    if (!body.customerName) return reply.code(400).send({ error: 'customerName required' });
    if (!body.lines?.length) return reply.code(400).send({ error: 'At least one line is required' });

    // Auto-generate quote number
    const lastQuote = await prisma.quotation.findFirst({ orderBy: { createdAt: 'desc' } });
    const nextNum = lastQuote
      ? parseInt(lastQuote.quoteNumber.replace('COT-', ''), 10) + 1
      : 1;
    const quoteNumber = `COT-${String(nextNum).padStart(6, '0')}`;

    // Compute line totals
    const computedLines = body.lines.map(l => {
      const lineTotal = l.qty * l.unitPrice;
      return {
        productId: l.productId || null,
        productName: l.productName,
        qty: l.qty,
        unitPrice: l.unitPrice,
        lineTotalPen: Math.round(lineTotal * 10000) / 10000,
        notes: l.notes || null,
      };
    });

    const subtotalPen = computedLines.reduce((sum, l) => sum + l.lineTotalPen, 0);
    const igvPen = Math.round(subtotalPen * IGV_RATE * 10000) / 10000;
    const totalPen = Math.round((subtotalPen + igvPen) * 10000) / 10000;

    const quotation = await prisma.quotation.create({
      data: {
        quoteNumber,
        customerName: body.customerName,
        customerEmail: body.customerEmail || null,
        customerPhone: body.customerPhone || null,
        customerDocNo: body.customerDocNo || null,
        customerDocType: body.customerDocType || null,
        customerId: body.customerId || null,
        subtotalPen,
        igvPen,
        totalPen,
        validUntil: body.validUntil ? new Date(body.validUntil) : null,
        notes: body.notes || null,
        createdBy: req.actor!.sub,
        lines: { create: computedLines },
      },
      include: { lines: true },
    });

    return reply.code(201).send({ data: quotation });
  });

  // ── Update quotation status ───────────────────────────────────────────────
  app.patch('/:id/status', { preHandler: [requireAnyOf('SALES_MGR', 'OPS_MGR')] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const { status } = req.body as { status: string };
    const validStatuses = ['DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED'];
    if (!validStatuses.includes(status)) return reply.code(400).send({ error: 'Invalid status' });

    const quotation = await prisma.quotation.update({
      where: { id },
      data: { status: status as any },
      include: { lines: true },
    });
    return reply.send({ data: quotation });
  });

  // ── Delete quotation ──────────────────────────────────────────────────────
  app.delete('/:id', { preHandler: [requireAnyOf('SALES_MGR')] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    await prisma.quotation.delete({ where: { id } });
    return reply.code(204).send();
  });
}
