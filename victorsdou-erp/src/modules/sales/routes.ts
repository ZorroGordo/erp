import type { FastifyInstance } from 'fastify';
import { requireAnyOf } from '../../middleware/auth';
import { prisma } from '../../lib/prisma';
import * as SalesService from './service';
import { notifySalesOrderConfirmed } from '../../services/notifications';
import { sendEmail } from '../../lib/email';

// ── Customer-facing email templates for order status changes ─────────────────
const wrap = (content: string) => `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f9f5f0;font-family:Georgia,serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f9f5f0;padding:32px 16px;">
<tr><td align="center"><table width="600" cellpadding="0" cellspacing="0"
  style="max-width:600px;width:100%;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08);">
<tr><td style="background:#1a1a1a;padding:28px 32px;text-align:center;">
  <p style="margin:0;color:#c8b560;font-size:11px;letter-spacing:4px;text-transform:uppercase;font-family:Arial,sans-serif;">PAN DE MASA MADRE ARTESANAL</p>
  <h1 style="margin:6px 0 0;color:#fff;font-size:26px;letter-spacing:2px;text-transform:uppercase;">Victorsdou</h1>
</td></tr>
<tr><td style="padding:32px 32px 8px;">${content}</td></tr>
<tr><td style="background:#f9f5f0;padding:20px 32px;text-align:center;border-top:1px solid #ede9e1;">
  <p style="margin:0;font-family:Arial,sans-serif;font-size:12px;color:#888;">
    Victorsdou · Lima, Peru &nbsp;|&nbsp;
    <a href="https://victorsdou.pe" style="color:#6b7c4b;text-decoration:none;">victorsdou.pe</a>
  </p>
</td></tr></table></td></tr></table></body></html>`;

function buildAcceptedEmail(name: string, orderId: string, deliveryDate?: Date | null, addr?: any): string {
  let dateStr = 'en breve';
  if (deliveryDate) {
    dateStr = new Date(deliveryDate).toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }
  const ctaUrl = `https://victorsdou.pe/tienda/cuenta/pedidos/${orderId}`;
  return wrap(`
    <h2 style="margin:0 0 4px;color:#1a1a1a;font-size:22px;">Pedido aceptado y programado</h2>
    <p style="margin:0 0 24px;color:#666;font-family:Arial,sans-serif;font-size:14px;">
      Hola ${name}, tu pedido fue aceptado y está programado para su entrega.
    </p>
    <div style="background:#f0f4ea;border-left:4px solid #6b7c4b;border-radius:0 8px 8px 0;padding:16px 20px;margin-bottom:24px;">
      <p style="margin:0 0 4px;font-family:Arial,sans-serif;font-size:12px;color:#6b7c4b;letter-spacing:1px;text-transform:uppercase;font-weight:600;">📅 Fecha de entrega</p>
      <p style="margin:0;font-family:Arial,sans-serif;font-size:15px;color:#1a1a1a;font-weight:600;">${dateStr}</p>
    </div>
    <p style="font-family:Arial,sans-serif;font-size:14px;color:#666;margin-bottom:24px;">
      Nuestro equipo ya está preparando tu pedido. Te avisaremos cuando esté en camino.
    </p>
    <div style="text-align:center;padding-bottom:8px;">
      <a href="${ctaUrl}" style="display:inline-block;background:#6b7c4b;color:#fff;text-decoration:none;padding:12px 28px;border-radius:6px;font-family:Arial,sans-serif;font-size:14px;font-weight:600;letter-spacing:1px;text-transform:uppercase;">Ver mi pedido</a>
    </div>`);
}

function buildDispatchEmail(name: string, orderId: string, addr?: any): string {
  const addrLine = addr ? `${addr.street ?? ''}, ${addr.district ?? ''}` : '';
  const ctaUrl = `https://victorsdou.pe/tienda/cuenta/pedidos/${orderId}`;
  return wrap(`
    <h2 style="margin:0 0 4px;color:#1a1a1a;font-size:22px;">Tu pedido está en camino 🚚</h2>
    <p style="margin:0 0 24px;color:#666;font-family:Arial,sans-serif;font-size:14px;">
      Hola ${name}, ¡tu pan ya salió a entregarse!
    </p>
    <div style="background:#fef9ec;border-left:4px solid #c8b560;border-radius:0 8px 8px 0;padding:16px 20px;margin-bottom:24px;">
      <p style="margin:0 0 4px;font-family:Arial,sans-serif;font-size:12px;color:#c8b560;letter-spacing:1px;text-transform:uppercase;font-weight:600;">📦 En ruta</p>
      <p style="margin:0;font-family:Arial,sans-serif;font-size:14px;color:#333;">
        ${addrLine ? `Entregando en <strong>${addrLine}</strong>. ` : ''}Por favor asegúrate de estar disponible.
      </p>
    </div>
    <div style="text-align:center;padding-bottom:8px;">
      <a href="https://wa.me/51944200333" style="display:inline-block;background:#25d366;color:#fff;text-decoration:none;padding:12px 20px;border-radius:6px;font-family:Arial,sans-serif;font-size:14px;font-weight:600;margin-right:10px;">WhatsApp</a>
      <a href="${ctaUrl}" style="display:inline-block;background:#6b7c4b;color:#fff;text-decoration:none;padding:12px 20px;border-radius:6px;font-family:Arial,sans-serif;font-size:14px;font-weight:600;">Ver pedido</a>
    </div>`);
}

function buildDeliveredEmail(name: string, orderId: string): string {
  return wrap(`
    <h2 style="margin:0 0 4px;color:#1a1a1a;font-size:22px;">¡Pedido entregado! 🎉</h2>
    <p style="margin:0 0 24px;color:#666;font-family:Arial,sans-serif;font-size:14px;">
      Hola ${name}, tu pedido fue entregado exitosamente. ¡Esperamos que lo disfrutes!
    </p>
    <div style="background:#f9f5f0;border-radius:8px;padding:20px;text-align:center;margin-bottom:24px;">
      <p style="margin:0 0 8px;font-size:32px;">🍞</p>
      <p style="margin:0;font-family:Arial,sans-serif;font-size:14px;color:#666;">Gracias por confiar en Victorsdou.<br>Hecho con amor, masa madre y paciencia.</p>
    </div>
    <div style="text-align:center;padding-bottom:8px;">
      <a href="https://victorsdou.pe/tienda" style="display:inline-block;background:#6b7c4b;color:#fff;text-decoration:none;padding:12px 28px;border-radius:6px;font-family:Arial,sans-serif;font-size:14px;font-weight:600;letter-spacing:1px;text-transform:uppercase;">Comprar de nuevo</a>
    </div>`);
}

// ── Email template for new ecommerce orders ───────────────────────────────────

function buildEcommerceOrderEmail(order: any, body: any): string {
  const items = (body.items ?? []).map((i: any) =>
    `<tr>
      <td style="padding:6px 12px;border-bottom:1px solid #f3f4f6;">${i.productName ?? i.name ?? ''}</td>
      <td style="padding:6px 12px;border-bottom:1px solid #f3f4f6;text-align:center;">${i.qty}</td>
      <td style="padding:6px 12px;border-bottom:1px solid #f3f4f6;text-align:right;">S/ ${Number(i.unitPrice).toFixed(2)}</td>
      <td style="padding:6px 12px;border-bottom:1px solid #f3f4f6;text-align:right;">S/ ${(Number(i.unitPrice) * Number(i.qty)).toFixed(2)}</td>
    </tr>`
  ).join('');

  const addr = body.deliveryAddress ?? {};

  return `
<div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#111827;">
  <div style="background:#4f46e5;padding:20px 24px;border-radius:8px 8px 0 0;">
    <h1 style="margin:0;color:#fff;font-size:20px;">🛍 Nuevo pedido ecommerce</h1>
    <p style="margin:4px 0 0;color:#c7d2fe;font-size:14px;">Pedido #${order.orderNumber}</p>
  </div>
  <div style="background:#fff;padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;">

    <h2 style="font-size:15px;color:#374151;margin:0 0 8px;">Cliente</h2>
    <p style="margin:0 0 4px;font-size:14px;color:#6b7280;">
      ${body.customerName ?? '—'}<br/>
      ${body.customerEmail ?? ''} ${body.customerPhone ? '· ' + body.customerPhone : ''}
    </p>

    <h2 style="font-size:15px;color:#374151;margin:16px 0 8px;">Entrega</h2>
    <p style="margin:0 0 4px;font-size:14px;color:#6b7280;">
      ${body.deliveryDate ? new Date(body.deliveryDate).toLocaleDateString('es-PE', { weekday:'long', year:'numeric', month:'long', day:'numeric' }) : '—'}<br/>
      ${addr.street ?? ''}, ${addr.district ?? ''}, ${addr.city ?? 'Lima'}
      ${addr.reference ? '<br/>Ref: ' + addr.reference : ''}
    </p>

    <h2 style="font-size:15px;color:#374151;margin:16px 0 8px;">Productos</h2>
    <table style="width:100%;border-collapse:collapse;font-size:14px;">
      <thead>
        <tr style="background:#f9fafb;">
          <th style="padding:8px 12px;text-align:left;color:#6b7280;font-weight:600;">Producto</th>
          <th style="padding:8px 12px;text-align:center;color:#6b7280;font-weight:600;">Cant.</th>
          <th style="padding:8px 12px;text-align:right;color:#6b7280;font-weight:600;">Precio unit.</th>
          <th style="padding:8px 12px;text-align:right;color:#6b7280;font-weight:600;">Total</th>
        </tr>
      </thead>
      <tbody>${items}</tbody>
    </table>

    <div style="margin-top:12px;text-align:right;font-size:14px;color:#374151;">
      <p style="margin:4px 0;">Subtotal: <strong>S/ ${Number(order.subtotalPen).toFixed(2)}</strong></p>
      <p style="margin:4px 0;">IGV (18%): <strong>S/ ${Number(order.igvPen).toFixed(2)}</strong></p>
      <p style="margin:4px 0;font-size:16px;">Total: <strong style="color:#4f46e5;">S/ ${Number(order.totalPen).toFixed(2)}</strong></p>
    </div>

    ${body.notes ? `<p style="margin-top:16px;font-size:13px;color:#6b7280;background:#f9fafb;padding:12px;border-radius:6px;">📝 ${body.notes}</p>` : ''}

    <div style="margin-top:20px;padding-top:16px;border-top:1px solid #e5e7eb;">
      <a href="https://erp-rpjk.vercel.app/sales"
         style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;padding:10px 20px;border-radius:6px;font-size:14px;font-weight:600;">
        Ver en VictorOS ERP →
      </a>
    </div>
  </div>
  <p style="font-size:12px;color:#9ca3af;text-align:center;margin-top:12px;">
    Victorsdou · VictorOS ERP · Este aviso se envió automáticamente
  </p>
</div>`;
}

// ── Routes ────────────────────────────────────────────────────────────────────

export async function salesRoutes(app: FastifyInstance) {

  // ── List orders (with optional channel / status filter) ───────────────────
  app.get('/', { preHandler: [requireAnyOf('SALES_AGENT', 'SALES_MGR', 'OPS_MGR', 'FINANCE_MGR')] }, async (req, reply) => {
    const q = req.query as { status?: string; customerId?: string; channel?: string };
    const orders = await prisma.salesOrder.findMany({
      where: {
        ...(q.status    ? { status:     q.status    as never } : {}),
        ...(q.customerId ? { customerId: q.customerId } : {}),
        ...(q.channel   ? { channel:    q.channel   as never } : {}),
      },
      include: { customer: true, lines: { include: { product: true } }, payments: true },
      orderBy: { createdAt: 'desc' },
    });
    return reply.send({ data: orders });
  });

  // ── Record payment on an order ──────────────────────────────────────────────
  app.post('/:id/payments', { preHandler: [requireAnyOf('SALES_AGENT', 'SALES_MGR', 'OPS_MGR', 'FINANCE_MGR')] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as {
      method: string; amountPen: number; referenceNo?: string; notes?: string;
    };
    const order = await prisma.salesOrder.findUniqueOrThrow({ where: { id }, include: { payments: true } });
    const payment = await prisma.paymentRecord.create({
      data: {
        salesOrderId: id,
        method: body.method,
        amountPen: body.amountPen,
        referenceNo: body.referenceNo ?? null,
        paidAt: new Date(),
        notes: body.notes ?? null,
        createdBy: req.actor!.sub,
      },
    });
    // Update order payment status
    const totalPaid = (order.payments ?? []).reduce((s: number, p: any) => s + Number(p.amountPen), 0) + body.amountPen;
    const orderTotal = Number(order.totalPen);
    const newStatus = totalPaid >= orderTotal ? 'PAID' : 'PARTIAL';
    await prisma.salesOrder.update({
      where: { id },
      data: { paymentStatus: newStatus as never },
    });
    return reply.code(201).send({ data: payment });
  });

  // ── Update invoice type ──────────────────────────────────────────────────────
  app.patch('/:id/invoice-type', { preHandler: [requireAnyOf('SALES_AGENT', 'SALES_MGR', 'OPS_MGR', 'FINANCE_MGR')] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const { invoiceType } = req.body as { invoiceType: string };
    const order = await prisma.salesOrder.update({ where: { id }, data: { invoiceType } });
    return reply.send({ data: order });
  });

  // ── Price preview ─────────────────────────────────────────────────────────
  app.get('/:id/price-preview', { preHandler: [requireAnyOf('SALES_AGENT', 'SALES_MGR')] }, async (req, reply) => {
    const { customerId, lines } = req.body as { customerId: string; lines: { productId: string; qty: number }[] };
    const preview = await SalesService.previewOrderPricing(customerId, lines);
    return reply.send({ data: preview });
  });

  // ── Create order (internal / ERP staff) ──────────────────────────────────
  app.post('/', { preHandler: [requireAnyOf('SALES_AGENT', 'SALES_MGR')] }, async (req, reply) => {
    const body = req.body as Parameters<typeof SalesService.createOrder>[0];
    const order = await SalesService.createOrder({ ...body, createdBy: req.actor!.sub });
    return reply.code(201).send({ data: order });
  });

  // ── PUBLIC: Create order from ecommerce ───────────────────────────────────
  // No auth — called by victorsdou-next after successful Culqi payment
  app.post('/ecommerce', async (req, reply) => {
    const body = req.body as {
      ecommerceOrderId:  string;
      customerName:      string;
      customerEmail:     string;
      customerPhone?:    string;
      items: Array<{
        productId:   string;
        productName: string;
        qty:         number;
        unitPrice:   number;   // sin-IGV
      }>;
      subtotalPen:      number;
      igvPen:           number;
      totalPen:         number;
      deliveryDate?:    string;
      deliveryAddress?: { street: string; district: string; city?: string; reference?: string };
      notes?:           string;
    };

    // Find or create the "Tienda Online" umbrella customer
    let ecCustomer = await prisma.customer.findFirst({ where: { docNumber: 'ECOMMERCE-STORE' } });
    if (!ecCustomer) {
      ecCustomer = await prisma.customer.create({
        data: {
          type:        'B2C',
          displayName: 'Tienda Online',
          docType:     'DNI',
          docNumber:   'ECOMMERCE-STORE',
        },
      });
    }

    const subtotal = Number(body.subtotalPen ?? 0);
    const igv      = Number(body.igvPen      ?? subtotal * 0.18);
    const total    = Number(body.totalPen    ?? subtotal + igv);

    const order = await prisma.salesOrder.create({
      data: {
        orderNumber:            `EC-${Date.now()}`,
        customerId:             ecCustomer.id,
        channel:                'ECOMMERCE',
        status:                 'PENDING_PAYMENT',
        subtotalPen:            subtotal,
        igvPen:                 igv,
        totalPen:               total,
        ecommerceOrderId:       body.ecommerceOrderId,
        ecommerceCustomerName:  body.customerName,
        ecommerceCustomerEmail: body.customerEmail,
        ecommerceCustomerPhone: body.customerPhone ?? null,
        addressSnap:            (body.deliveryAddress ?? null) as never,
        deliveryDate:           body.deliveryDate ? new Date(body.deliveryDate) : null,
        notes:                  body.notes ?? null,
        createdBy:              'ecommerce',
        lines: {
          create: (body.items ?? []).map(i => ({
            productId:    i.productId,
            qty:          i.qty,
            unitPrice:    i.unitPrice,
            lineTotalPen: i.qty * i.unitPrice,
          })),
        },
      },
      include: { lines: { include: { product: true } } },
    });

    // Fire-and-forget: notify ops team
    sendEmail({
      to:      ['luis@victorsdou.com', 'hola@victorsdou.com'],
      subject: `🛍 Nuevo pedido web #${order.orderNumber} — S/ ${total.toFixed(2)}`,
      html:    buildEcommerceOrderEmail(order, body),
    }).catch(console.error);

    return reply.code(201).send({ data: order });
  });

  // ── PUBLIC: get single ecommerce order by ID (no auth — ID is a secret UUID) ─
  app.get('/ecommerce/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const order = await prisma.salesOrder.findUnique({
      where: { id },
      include: {
        lines: { include: { product: true } },
      },
    });
    if (!order) return reply.code(404).send({ error: 'ORDER_NOT_FOUND', message: 'Order not found' });
    return reply.send({ data: order });
  });

  // ── Confirm (legacy / B2B) ────────────────────────────────────────────────
  app.patch('/:id/confirm', { preHandler: [requireAnyOf('SALES_MGR', 'OPS_MGR')] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const order = await prisma.salesOrder.update({
      where:   { id },
      data:    { status: 'CONFIRMED', confirmedAt: new Date() },
      include: { customer: true },
    });
    notifySalesOrderConfirmed({
      orderNumber: (order as any).orderNumber ?? id,
      totalPen:    Number((order as any).totalPen ?? 0),
      customer: {
        businessName: (order as any).customer?.businessName ?? null,
        contactName:  (order as any).customer?.contactName  ?? null,
        email:        (order as any).customer?.email        ?? null,
      },
    }).catch(console.error);
    return reply.send({ data: order });
  });

  // ── Ecommerce status transitions ──────────────────────────────────────────
  const statusPatch = (newStatus: string) => async (req: any, reply: any) => {
    const { id } = req.params as { id: string };
    const order = await prisma.salesOrder.update({ where: { id }, data: { status: newStatus as never } });
    return reply.send({ data: order });
  };

  // Patch with customer email notification
  const statusPatchWithEmail = (
    newStatus: string,
    buildEmail: (name: string, orderId: string, order: any) => string,
    subject: string,
  ) => async (req: any, reply: any) => {
    const { id } = req.params as { id: string };
    const order = await prisma.salesOrder.update({ where: { id }, data: { status: newStatus as never } });
    const email = (order as any).ecommerceCustomerEmail;
    const name  = (order as any).ecommerceCustomerName ?? email ?? 'Cliente';
    if (email) {
      sendEmail({ to: email, subject, html: buildEmail(name, id, order) }).catch(console.error);
    }
    return reply.send({ data: order });
  };
  app.patch('/:id/accept', { preHandler: [requireAnyOf('SALES_MGR', 'OPS_MGR')] }, async (req: any, reply: any) => {
    const { id } = req.params as { id: string };
    // Check payment exists before accepting
    const current = await prisma.salesOrder.findUniqueOrThrow({
      where: { id },
      include: { payments: true },
    });
    if ((current.payments ?? []).length === 0 && current.paymentStatus === 'UNPAID') {
      return reply.code(400).send({
        error: 'PAYMENT_REQUIRED',
        message: 'Debe registrar un pago antes de aceptar el pedido',
      });
    }
    const order = await prisma.salesOrder.update({ where: { id }, data: { status: 'ACCEPTED' as never } });
    const email = (order as any).ecommerceCustomerEmail;
    const name  = (order as any).ecommerceCustomerName ?? email ?? 'Cliente';
    if (email) {
      sendEmail({
        to: email,
        subject: 'Tu pedido fue aceptado - Victorsdou',
        html: buildAcceptedEmail(name, id, (order as any).deliveryDate, (order as any).addressSnap),
      }).catch(console.error);
    }
    return reply.send({ data: order });
  });
  app.patch('/:id/ready', { preHandler: [requireAnyOf('SALES_MGR', 'OPS_MGR')] }, statusPatch('READY'));
  app.patch('/:id/dispatch', { preHandler: [requireAnyOf('SALES_MGR', 'OPS_MGR')] },
    statusPatchWithEmail('IN_DELIVERY',
      (name, id, o) => buildDispatchEmail(name, id, (o as any).addressSnap),
      'Tu pedido esta en camino - Victorsdou'));
  app.patch('/:id/deliver', { preHandler: [requireAnyOf('SALES_MGR', 'OPS_MGR')] },
    statusPatchWithEmail('DELIVERED',
      (name, id) => buildDeliveredEmail(name, id),
      'Pedido entregado - Victorsdou'));
  app.patch('/:id/return', { preHandler: [requireAnyOf('SALES_MGR', 'OPS_MGR')] }, statusPatch('RETURNED'));

  // ── Cancel ────────────────────────────────────────────────────────────────
  app.patch('/:id/cancel', { preHandler: [requireAnyOf('SALES_MGR', 'OPS_MGR')] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const { reason } = req.body as { reason?: string };
    const order = await prisma.salesOrder.update({
      where: { id }, data: { status: 'CANCELLED', notes: reason },
    });
    return reply.send({ data: order });
  });
}
