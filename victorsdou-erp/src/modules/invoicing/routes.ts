import type { FastifyInstance } from 'fastify';
import { requireAnyOf } from '../../middleware/auth';
import { prisma } from '../../lib/prisma';
import { config } from '../../config';
import { emitirDocumento, buildFacturaPayload } from './factpro';
import { notifyInvoiceEmitted } from '../../services/notifications';

export async function invoicingRoutes(app: FastifyInstance) {
  app.get('/', { preHandler: [requireAnyOf('ACCOUNTANT', 'FINANCE_MGR', 'SALES_MGR', 'SUPER_ADMIN')] }, async (req, reply) => {
    const q = req.query as { docType?: string; status?: string; paymentStatus?: string; from?: string; to?: string; page?: string; pageSize?: string };
    const page = parseInt(q.page ?? '1');
    const pageSize = parseInt(q.pageSize ?? '50');
    const where = {
      ...(q.docType       ? { docType: q.docType as never }             : {}),
      ...(q.status        ? { status: q.status as never }               : {}),
      ...(q.paymentStatus ? { paymentStatus: q.paymentStatus as never } : {}),
      ...(q.from || q.to  ? { issueDate: { ...(q.from ? { gte: new Date(q.from) } : {}), ...(q.to ? { lte: new Date(q.to) } : {}) } } : {}),
    };
    const [invoices, total] = await Promise.all([
      prisma.invoice.findMany({
        where, orderBy: { issueDate: 'desc' }, skip: (page-1)*pageSize, take: pageSize,
        include: { lines: true, salesOrder: { select: { orderNumber: true, id: true } }, customer: { select: { id: true, displayName: true, docNumber: true, category: true, paymentTermsDays: true, tradeName: true } } },
      }),
      prisma.invoice.count({ where }),
    ]);
    return reply.send({ data: invoices, meta: { total, page, pageSize, totalPages: Math.ceil(total/pageSize) } });
  });

  // ââ GET pending orders (not yet invoiced) ââââââââââââââââââââââââââââââââ
  app.get('/pending-orders', { preHandler: [requireAnyOf('ACCOUNTANT', 'FINANCE_MGR', 'SALES_MGR', 'SUPER_ADMIN')] }, async (req, reply) => {
    const orders = await prisma.salesOrder.findMany({
      where: {
        status: { in: ['ACCEPTED', 'CONFIRMED', 'READY', 'IN_DELIVERY', 'DELIVERED'] as never[] },
        invoiceId: null,
      },
      include: {
        customer: { select: { id: true, displayName: true, docNumber: true, docType: true, email: true, category: true, paymentTermsDays: true, tradeName: true } },
        lines: { include: { product: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return reply.send({ data: orders });
  });

  // ââ Monthly income summary ââââââââââââââââââââââââââââââââââââââââââââââââ
  // GET /v1/invoices/summary?month=2026-02&customerType=B2B
  app.get('/summary', { preHandler: [requireAnyOf('ACCOUNTANT', 'FINANCE_MGR', 'SALES_MGR', 'SUPER_ADMIN')] }, async (req, reply) => {
    const q = req.query as { month?: string; customerType?: 'B2B' | 'B2C' };

    const now      = new Date();
    const monthStr = q.month ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const [yearS, monthS] = monthStr.split('-');
    const year  = parseInt(yearS);
    const month = parseInt(monthS);

    const from = new Date(year, month - 1, 1);
    const to   = new Date(year, month, 1);   // first day of next month (exclusive upper bound)

    // B2B â FACTURA (empresa con RUC), B2C â BOLETA (persona natural)
    const docTypeFilter =
      q.customerType === 'B2B' ? { docType: { in: ['FACTURA'] as never[] } }
    : q.customerType === 'B2C' ? { docType: { in: ['BOLETA']  as never[] } }
    : { docType: { in: ['FACTURA', 'BOLETA'] as never[] } };

    const invoices = await prisma.invoice.findMany({
      where: {
        ...docTypeFilter,
        status:    { in: ['ACCEPTED', 'SENT'] as never[] },
        issueDate: { gte: from, lt: to },
      },
      select: { totalPen: true, subtotalPen: true, igvPen: true, docType: true },
    });

    const round = (n: number) => Math.round(n * 100) / 100;
    const total       = round(invoices.reduce((s, i) => s + Number(i.totalPen), 0));
    const subtotal    = round(invoices.reduce((s, i) => s + Number(i.subtotalPen), 0));
    const igv         = round(invoices.reduce((s, i) => s + Number(i.igvPen), 0));
    const facturaTotal = round(invoices.filter(i => i.docType === 'FACTURA').reduce((s, i) => s + Number(i.totalPen), 0));
    const boletaTotal  = round(invoices.filter(i => i.docType === 'BOLETA').reduce((s, i) => s + Number(i.totalPen), 0));

    return reply.send({
      data: {
        month:        monthStr,
        customerType: q.customerType ?? 'all',
        totalIncome:  total,
        subtotal,
        igv,
        breakdown:    { factura: facturaTotal, boleta: boletaTotal },
        invoiceCount: invoices.length,
      },
    });
  });

  app.get('/:id', { preHandler: [requireAnyOf('ACCOUNTANT', 'FINANCE_MGR')] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const invoice = await prisma.invoice.findUnique({ where: { id }, include: { lines: true } });
    if (!invoice) return reply.code(404).send({ error: 'NOT_FOUND' });
    return reply.send({ data: invoice });
  });

  // ââ Create draft invoice ââââââââââââââââââââââââââââââââââââââââââââââââââ
  app.post('/', { preHandler: [requireAnyOf('ACCOUNTANT', 'FINANCE_MGR', 'SALES_MGR', 'SUPER_ADMIN')] }, async (req, reply) => {
    const body = req.body as {
      docType:      'FACTURA' | 'BOLETA' | 'NOTA_CREDITO' | 'NOTA_DEBITO';
      entityId?:    string;   // optional: linked customer id
      entityDocNo:  string;   // RUC, DNI, CE, Pasaporte
      entityName:   string;
      entityEmail?: string;   // optional: for Factpro delivery + CRM
      currency?:    string;
      paymentDueDays?: number;
      salesOrderId?:  string;
      items: {
        description:  string;
        productId?:   string;
        qty:          number;
        unitPrice:    number;   // before IGV
        igvRate?:     number;   // default 0.18
      }[];
    };

    if (!body.items?.length) return reply.code(400).send({ error: 'items required' });
    // For BOLETA, entity details are optional (anonymous emission allowed)
    if (body.docType !== 'BOLETA') {
      if (!body.entityDocNo) return reply.code(400).send({ error: 'entityDocNo required' });
      if (!body.entityName)  return reply.code(400).send({ error: 'entityName required' });
    }

    const igvRate    = 0.18;
    const currency   = body.currency ?? 'PEN';
    const docType    = body.docType  ?? 'FACTURA';

    // Auto-compute series based on docType
    const series = docType === 'BOLETA'       ? config.FACTPRO_SERIE_BOLETA
                 : docType === 'NOTA_CREDITO' ? `FC${config.FACTPRO_SERIE_FACTURA.slice(1)}`
                 : config.FACTPRO_SERIE_FACTURA;

    // Auto-increment correlative within series
    const lastInvoice = await prisma.invoice.findFirst({
      where: { series },
      orderBy: { correlative: 'desc' },
      select: { correlative: true },
    });
    const correlative = String((parseInt(lastInvoice?.correlative ?? '0') || 0) + 1).padStart(8, '0');

    // Compute line totals
    const computedLines = body.items.map(item => {
      const rate     = item.igvRate ?? igvRate;
      const qty      = Number(item.qty);
      const subtotal = Math.round(Number(item.unitPrice) * qty * 100) / 100;
      const igv      = Math.round(subtotal * rate * 100) / 100;
      const total    = Math.round((subtotal + igv) * 100) / 100;
      return { ...item, subtotal, igv, total, igvRate: rate };
    });

    const subtotalPen = computedLines.reduce((s, l) => s + l.subtotal, 0);
    const igvPen      = computedLines.reduce((s, l) => s + l.igv, 0);
    const totalPen    = computedLines.reduce((s, l) => s + l.total, 0);

    const dueDate = body.paymentDueDays != null
      ? new Date(Date.now() + body.paymentDueDays * 86400_000)
      : undefined;

    const invoice = await prisma.invoice.create({
      data: {
        docType:      docType as never,
        series,
        correlative,
        issueDate:    new Date(),
        entityType:   'CUSTOMER' as never,
        entityId:     body.entityId || null,
        entityDocNo:  body.entityDocNo ?? '',
        entityName:   body.entityName  ?? '',
        entityEmail:  body.entityEmail  ?? null,
        subtotalPen,
        igvPen,
        totalPen,
        currency,
        status:       'DRAFT' as never,
        salesOrderId: body.salesOrderId ?? null,
        paymentDueDate: dueDate,
        createdBy:    (req as any).user?.sub ?? 'system',
        lines: {
          create: computedLines.map(l => ({
            description: l.description,
            productId:   l.productId ?? null,
            qty:         l.qty,
            unitPrice:   l.unitPrice,
            igvRate:     l.igvRate,
            subtotal:    l.subtotal,
            igv:         l.igv,
            total:       l.total,
          })),
        },
      },
      include: { lines: true },
    });

    return reply.code(201).send({ data: invoice });
  });

  // ââ PATCH /:id â edit draft invoice ââââââââââââââââââââââââââââââââââââââ
  app.patch('/:id', { preHandler: [requireAnyOf('ACCOUNTANT', 'FINANCE_MGR', 'SUPER_ADMIN')] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const invoice = await prisma.invoice.findUnique({ where: { id }, include: { lines: true } });
    if (!invoice) return reply.code(404).send({ error: 'NOT_FOUND' });
    if (invoice.status !== 'DRAFT') return reply.code(422).send({ error: 'ONLY_DRAFT_EDITABLE', message: 'Solo se pueden editar facturas en borrador' });

    const body = req.body as {
      entityDocNo?: string;
      entityName?: string;
      entityEmail?: string;
      entityId?: string;
      paymentDueDays?: number;
      salesOrderId?: string;
      items?: { description: string; productId?: string; qty: number; unitPrice: number; igvRate?: number }[];
    };

    const igvRate = 0.18;
    let lineData: any = undefined;

    if (body.items?.length) {
      // Delete existing lines and recreate
      await prisma.invoiceLineItem.deleteMany({ where: { invoiceId: id } });
      const computedLines = body.items.map(item => {
        const rate = item.igvRate ?? igvRate;
        const subtotal = Math.round(item.unitPrice * item.qty * 100) / 100;
        const igv = Math.round(subtotal * rate * 100) / 100;
        const total = Math.round((subtotal + igv) * 100) / 100;
        return { description: item.description, productId: item.productId ?? null, qty: item.qty, unitPrice: item.unitPrice, igvRate: rate, subtotal, igv, total };
      });
      lineData = { create: computedLines };
      const subtotalPen = computedLines.reduce((s, l) => s + l.subtotal, 0);
      const igvPen = computedLines.reduce((s, l) => s + l.igv, 0);
      const totalPen = computedLines.reduce((s, l) => s + l.total, 0);
      const dueDate = body.paymentDueDays != null ? new Date(Date.now() + body.paymentDueDays * 86400_000) : undefined;

      const updated = await prisma.invoice.update({
        where: { id },
        data: {
          ...(body.entityDocNo !== undefined ? { entityDocNo: body.entityDocNo } : {}),
          ...(body.entityName  !== undefined ? { entityName:  body.entityName }  : {}),
          ...(body.entityEmail !== undefined ? { entityEmail: body.entityEmail }  : {}),
          ...(body.entityId    !== undefined ? { entityId:    body.entityId }     : {}),
          ...(body.salesOrderId !== undefined ? { salesOrderId: body.salesOrderId } : {}),
          ...(dueDate ? { paymentDueDate: dueDate } : {}),
          subtotalPen, igvPen, totalPen,
          lines: lineData,
        },
        include: { lines: true },
      });
      return reply.send({ data: updated });
    }

    // Update metadata only (no line changes)
    const dueDate = body.paymentDueDays != null ? new Date(Date.now() + body.paymentDueDays * 86400_000) : undefined;
    const updated = await prisma.invoice.update({
      where: { id },
      data: {
        ...(body.entityDocNo !== undefined ? { entityDocNo: body.entityDocNo } : {}),
        ...(body.entityName  !== undefined ? { entityName:  body.entityName }  : {}),
        ...(body.entityEmail !== undefined ? { entityEmail: body.entityEmail }  : {}),
        ...(body.entityId    !== undefined ? { entityId:    body.entityId }     : {}),
        ...(body.salesOrderId !== undefined ? { salesOrderId: body.salesOrderId } : {}),
        ...(dueDate ? { paymentDueDate: dueDate } : {}),
      },
      include: { lines: true },
    });
    return reply.send({ data: updated });
  });

  // ââ POST /from-orders â create invoices from sales orders (bulk) âââââââââ
  app.post('/from-orders', { preHandler: [requireAnyOf('ACCOUNTANT', 'FINANCE_MGR', 'SALES_MGR', 'SUPER_ADMIN')] }, async (req, reply) => {
    const body = req.body as { orderIds: string[]; emitAfter?: boolean };
    if (!body.orderIds?.length) return reply.code(400).send({ error: 'orderIds required' });

    const orders = await prisma.salesOrder.findMany({
      where: { id: { in: body.orderIds } },
      include: { customer: true, lines: { include: { product: true } } },
    });

    const results: any[] = [];
    for (const order of orders) {
      if (order.invoiceId) { results.push({ orderId: order.id, error: 'ALREADY_INVOICED' }); continue; }

      const docType = order.invoiceType === 'BOLETA' ? 'BOLETA' : 'FACTURA';
      const series = docType === 'BOLETA' ? config.FACTPRO_SERIE_BOLETA : config.FACTPRO_SERIE_FACTURA;
      const lastInvoice = await prisma.invoice.findFirst({ where: { series }, orderBy: { correlative: 'desc' }, select: { correlative: true } });
      const correlative = String((parseInt(lastInvoice?.correlative ?? '0') || 0) + 1).padStart(8, '0');

      const igvRate = 0.18;
      const computedLines = order.lines.map(line => {
        const unitPrice = Number(line.unitPrice);
        const qty = Number(line.qty);
        const subtotal = Math.round(unitPrice * qty * 100) / 100;
        const igv = Math.round(subtotal * igvRate * 100) / 100;
        const total = Math.round((subtotal + igv) * 100) / 100;
        return {
          description: line.product?.name ?? `Producto ${line.productId?.slice(-6)}`,
          productId: line.productId,
          qty, unitPrice, igvRate, subtotal, igv, total,
        };
      });

      const subtotalPen = computedLines.reduce((s, l) => s + l.subtotal, 0);
      const igvPen = computedLines.reduce((s, l) => s + l.igv, 0);
      const totalPen = computedLines.reduce((s, l) => s + l.total, 0);

      const dueDate = order.customer?.paymentTermsDays
        ? new Date(Date.now() + order.customer.paymentTermsDays * 86400_000)
        : undefined;

      const invoice = await prisma.invoice.create({
        data: {
          docType: docType as never,
          series, correlative,
          issueDate: new Date(),
          entityType: 'CUSTOMER' as never,
          entityId: order.customerId,
          entityDocNo: order.customer?.docNumber ?? '',
          entityName: order.customer?.displayName ?? '',
          entityEmail: order.customer?.email ?? null,
          subtotalPen, igvPen, totalPen,
          currency: order.currency,
          status: 'DRAFT' as never,
          salesOrderId: order.id,
          paymentDueDate: dueDate,
          createdBy: (req as any).user?.sub ?? 'system',
          lines: { create: computedLines.map(l => ({ description: l.description, productId: l.productId, qty: l.qty, unitPrice: l.unitPrice, igvRate: l.igvRate, subtotal: l.subtotal, igv: l.igv, total: l.total })) },
        },
        include: { lines: true },
      });

      // Link invoice back to order
      await prisma.salesOrder.update({ where: { id: order.id }, data: { invoiceId: invoice.id } });

      // Emit if requested
      if (body.emitAfter) {
        try {
          const tipoDocumento = docType === 'BOLETA' ? '03' : '01';
          const serie = tipoDocumento === '01' ? config.FACTPRO_SERIE_FACTURA : config.FACTPRO_SERIE_BOLETA;
          const payload = buildFacturaPayload({
            tipoDocumento, serie,
            entityDocType: (order.customer?.docNumber?.length === 11 ? 'RUC' : order.customer?.docNumber?.length === 8 ? 'DNI' : 'CE') as any,
            entityDocNo: order.customer?.docNumber ?? '',
            entityName: order.customer?.displayName ?? '',
            entityEmail: order.customer?.email ?? undefined,
            issueDate: new Date(),
            currency: order.currency,
            items: computedLines.map(l => ({ descripcion: l.description, cantidad: Number(l.qty), valorUnitario: l.unitPrice, igvRate: l.igvRate })),
          });
          await prisma.invoice.update({ where: { id: invoice.id }, data: { status: 'SENT' as never } });
          const factproRes = await emitirDocumento(payload);
          const accepted = factproRes.success && factproRes.state_description?.toLowerCase().includes('aceptado');
          await prisma.invoice.update({
            where: { id: invoice.id },
            data: {
              status: accepted ? 'ACCEPTED' : 'REJECTED',
              series: factproRes.number?.split('-')[0] ?? invoice.series,
              correlative: factproRes.number?.split('-')[1] ?? invoice.correlative,
              hashCpe: factproRes.hash ?? null,
              qrCodeUrl: factproRes.qr ?? null,
              pdfUrl: factproRes.links?.pdf ?? null,
              xmlUrl: factproRes.links?.xml ?? null,
              nubefactId: factproRes.external_id ?? null,
              cdrResponse: factproRes as never,
              rejectionReason: !accepted ? (factproRes.message ?? 'Rechazado') : null,
            },
          });
          results.push({ orderId: order.id, invoiceId: invoice.id, status: accepted ? 'ACCEPTED' : 'REJECTED' });
        } catch (err: any) {
          await prisma.invoice.update({ where: { id: invoice.id }, data: { status: 'REJECTED', rejectionReason: err.message } });
          results.push({ orderId: order.id, invoiceId: invoice.id, status: 'ERROR', error: err.message });
        }
      } else {
        results.push({ orderId: order.id, invoiceId: invoice.id, status: 'DRAFT' });
      }
    }

    return reply.send({ data: results });
  });

  // ââ Emit to SUNAT via Factpro âââââââââââââââââââââââââââââââââââââââââââââ
  app.post('/:id/emit', { preHandler: [requireAnyOf('ACCOUNTANT', 'FINANCE_MGR', 'SUPER_ADMIN')] }, async (req, reply) => {
    const { id } = req.params as { id: string };

    const invoice = await prisma.invoice.findUnique({ where: { id }, include: { lines: true } });
    if (!invoice) return reply.code(404).send({ error: 'NOT_FOUND' });
    if (invoice.status === 'ACCEPTED') return reply.code(422).send({ error: 'ALREADY_EMITTED' });
    if (invoice.status === 'VOIDED')   return reply.code(422).send({ error: 'INVOICE_VOIDED' });

    const tipoDocumento = invoice.docType === "BOLETA" ? "03" : "01";
    const serie = tipoDocumento === "01" ? config.FACTPRO_SERIE_FACTURA : config.FACTPRO_SERIE_BOLETA;

    const payload = buildFacturaPayload({
      tipoDocumento,
      serie,
      entityDocType:  invoice.entityDocNo.length === 11 ? 'RUC' : invoice.entityDocNo.length === 8 ? 'DNI' : 'CE',
      entityDocNo:    invoice.entityDocNo,
      entityName:     invoice.entityName,
      entityEmail:    (invoice as any).entityEmail ?? undefined,
      issueDate:      invoice.issueDate,
      currency:       invoice.currency,
      items: invoice.lines.map(l => ({
        descripcion:   l.description,
        cantidad:      Number(l.qty),
        valorUnitario: Number(l.unitPrice),
        igvRate:       Number(l.igvRate),
      })),
    });

    // Mark as SENT while we call Factpro
    await prisma.invoice.update({ where: { id }, data: { status: 'SENT' as never } });

    let factproRes;
    try {
      factproRes = await emitirDocumento(payload);
    } catch (err: any) {
      await prisma.invoice.update({ where: { id }, data: { status: 'REJECTED', rejectionReason: err.message } });
      return reply.code(err.statusCode ?? 502).send({ error: 'FACTPRO_ERROR', detail: err.message });
    }

    const accepted = factproRes.success && factproRes.state_description?.toLowerCase().includes('aceptado');
    await prisma.invoice.update({
      where: { id },
      data: {
        status:          accepted ? 'ACCEPTED' : 'REJECTED',
        series:          factproRes.number?.split('-')[0] ?? invoice.series,
        correlative:     factproRes.number?.split('-')[1] ?? invoice.correlative,
        hashCpe:         factproRes.hash    ?? null,
        qrCodeUrl:       factproRes.qr      ?? null,
        pdfUrl:          factproRes.links?.pdf ?? null,
        xmlUrl:          factproRes.links?.xml ?? null,
        nubefactId:      factproRes.external_id ?? null,   // reuse field for factpro external_id
        cdrResponse:     factproRes as never,
        rejectionReason: !accepted ? (factproRes.message ?? factproRes.errors?.join('; ') ?? 'Rechazado por SUNAT') : null,
      },
    });

    // Fire-and-forget: notify client + ops after successful emission
    if (accepted) {
      notifyInvoiceEmitted({
        series:      factproRes.number?.split('-')[0] ?? invoice.series,
        correlative: factproRes.number?.split('-')[1] ?? invoice.correlative,
        entityName:  invoice.entityName,
        entityEmail: (invoice as any).entityEmail ?? null,
        totalPen:    Number(invoice.totalPen),
        pdfUrl:      factproRes.links?.pdf ?? null,
      }).catch(console.error);
    }

    return reply.send({ data: factproRes, accepted });
  });

}
