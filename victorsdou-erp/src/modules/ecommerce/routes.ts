/**
 * Ecommerce public API routes â mounted at /api
 *
 * These routes serve the victorsdou.pe storefront (Next.js).
 * They do NOT require ERP auth â the ecommerce frontend calls them
 * from the checkout flow and the customer account area.
 */
import type { FastifyInstance } from 'fastify';
import { prisma } from '../../lib/prisma';
import { sendEmail } from '../../lib/email';
import { config } from '../../config';

// Culqi API base
const CULQI_API = 'https://api.culqi.com/v2';

export async function ecommerceRoutes(app: FastifyInstance) {
  // ââ POST /api/orders â create order from ecommerce checkout âââââââââââââââ
  app.post('/orders', async (req, reply) => {
    const body = req.body as {
      email: string;
      phone: string;
      address: { street: string; district: string; city?: string };
      invoiceType: 'boleta' | 'factura';
      dni?: string;
      ruc?: string;
      razonSocial?: string;
      deliverySlot: { date: string; timeRange: string };
      deliveryFee: number;
      notes?: string;
      items: Array<{
        productVariantId: string;
        quantity: number;
        isSubscription: boolean;
      }>;
    };

    // Resolve product info for each item
    const productIds = body.items.map((i) => i.productVariantId);
    const products = await prisma.product.findMany({
      where: { id: { in: productIds } },
    });
    const productMap = new Map(products.map((p) => [p.id, p]));

    // Build line items â prices stored sin IGV in DB, display con IGV
    const lines: Array<{
      productId: string;
      productName: string;
      qty: number;
      unitPrice: number;       // sin IGV
      unitPriceInc: number;    // con IGV
      lineTotalPen: number;    // sin IGV
    }> = [];

    for (const item of body.items) {
      const product = productMap.get(item.productVariantId);
      if (!product) {
        return reply.code(400).send({
          error: 'INVALID_PRODUCT',
          message: `Product ${item.productVariantId} not found`,
        });
      }
      const basePriceSinIgv = Number(product.basePricePen ?? 0);
      const priceConIgv = Math.round(basePriceSinIgv * 1.18 * 100) / 100;

      lines.push({
        productId: product.id,
        productName: product.name,
        qty: item.quantity,
        unitPrice: basePriceSinIgv,
        unitPriceInc: priceConIgv,
        lineTotalPen: basePriceSinIgv * item.quantity,
      });
    }

    const subtotalSinIgv = lines.reduce((s, l) => s + l.lineTotalPen, 0);
    const igv = Math.round(subtotalSinIgv * 0.18 * 100) / 100;
    const deliveryFeeSinIgv = Math.round((body.deliveryFee / 1.18) * 100) / 100;
    const totalSinIgv = subtotalSinIgv + deliveryFeeSinIgv;
    const totalConIgv = Math.round(totalSinIgv * 1.18 * 100) / 100;

    // Find or create "Tienda Online" customer
    let ecCustomer = await prisma.customer.findFirst({
      where: { docNumber: 'ECOMMERCE-STORE' },
    });
    if (!ecCustomer) {
      ecCustomer = await prisma.customer.create({
        data: {
          type: 'B2C',
          displayName: 'Tienda Online',
          docType: 'DNI',
          docNumber: 'ECOMMERCE-STORE',
        },
      });
    }

    // Parse delivery time
    let deliveryTimeStart: string | null = null;
    if (body.deliverySlot?.timeRange) {
      const parts = body.deliverySlot.timeRange.split('-').map((s: string) => s.trim());
      deliveryTimeStart = parts[0] ?? null;
    }

    const order = await prisma.salesOrder.create({
      data: {
        orderNumber: `EC-${Date.now()}`,
        customerId: ecCustomer.id,
        channel: 'ECOMMERCE',
        status: 'PENDING_PAYMENT',
        subtotalPen: subtotalSinIgv,
        igvPen: igv,
        totalPen: totalConIgv,
        ecommerceCustomerName: body.email,
        ecommerceCustomerEmail: body.email,
        ecommerceCustomerPhone: body.phone ?? null,
        addressSnap: (body.address ?? null) as never,
        deliveryDate: body.deliverySlot?.date
          ? new Date(body.deliverySlot.date)
          : null,
        notes: body.notes ?? null,
        invoiceType: body.invoiceType === 'factura' ? 'FACTURA' : 'BOLETA',
        createdBy: 'ecommerce',
        lines: {
          create: lines.map((l) => ({
            productId: l.productId,
            qty: l.qty,
            unitPrice: l.unitPrice,
            lineTotalPen: l.lineTotalPen,
          })),
        },
      },
      include: { lines: { include: { product: true } } },
    });

    return reply.code(201).send({
      id: order.id,
      orderNumber: order.orderNumber,
      totalPen: totalConIgv,
      status: order.status,
    });
  });

  // ââ POST /api/payments/init â return Culqi public key + order info ââââââââ
  app.post('/payments/init', async (req, reply) => {
    const { orderId, amount } = req.body as { orderId: string; amount: number };

    const culqiPublicKey = process.env.CULQI_PUBLIC_KEY;
    if (!culqiPublicKey) {
      return reply.code(500).send({
        error: 'PAYMENT_NOT_CONFIGURED',
        message: 'Pasarela de pago no configurada',
      });
    }

    // Verify order exists
    const order = await prisma.salesOrder.findUnique({ where: { id: orderId } });
    if (!order) {
      return reply.code(404).send({ error: 'ORDER_NOT_FOUND', message: 'Order not found' });
    }

    return reply.send({
      publicKey: culqiPublicKey,
      orderId: order.id,
      amount,
      currency: 'PEN',
    });
  });

  // ââ POST /api/payments/finalize â charge via Culqi and update order âââââââ
  app.post('/payments/finalize', async (req, reply) => {
    const { orderId, culqiToken } = req.body as {
      orderId: string;
      culqiToken: string;
    };

    const culqiSecretKey = process.env.CULQI_SECRET_KEY;
    if (!culqiSecretKey) {
      return reply.code(500).send({
        error: 'PAYMENT_NOT_CONFIGURED',
        message: 'Pasarela de pago no configurada',
      });
    }

    // Get order
    const order = await prisma.salesOrder.findUnique({
      where: { id: orderId },
      include: { lines: { include: { product: true } } },
    });
    if (!order) {
      return reply.code(404).send({ error: 'ORDER_NOT_FOUND', message: 'Order not found' });
    }

    // Calculate amount in cents
    const amountCents = Math.round(Number(order.totalPen) * 100);

    // Charge via Culqi
    try {
      const chargeRes = await fetch(`${CULQI_API}/charges`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${culqiSecretKey}`,
        },
        body: JSON.stringify({
          amount: amountCents,
          currency_code: 'PEN',
          email: (order as any).ecommerceCustomerEmail ?? 'noreply@victorsdou.pe',
          source_id: culqiToken,
          description: `Pedido ${order.orderNumber}`,
          metadata: {
            order_id: order.id,
            order_number: order.orderNumber,
          },
        }),
      });

      const chargeData = (await chargeRes.json()) as any;

      if (!chargeRes.ok) {
        return reply.code(400).send({
          success: false,
          message: chargeData?.user_message ?? chargeData?.merchant_message ?? 'Pago rechazado',
        });
      }

      // Payment successful â update order
      await prisma.salesOrder.update({
        where: { id: orderId },
        data: {
          status: 'CONFIRMED',
          paymentStatus: 'PAID',
          confirmedAt: new Date(),
        },
      });

      // Record the payment
      await prisma.paymentRecord.create({
        data: {
          salesOrderId: orderId,
          method: 'CULQI_CARD',
          amountPen: Number(order.totalPen),
          referenceNo: chargeData.id ?? null,
          paidAt: new Date(),
          notes: `Culqi charge ${chargeData.id}`,
          createdBy: 'ecommerce',
        },
      });

      // Notify ops team
      sendEmail({
        to: ['luis@victorsdou.com', 'hola@victorsdou.com'],
        subject: `\u{1F6CD} Nuevo pedido web #${order.orderNumber} \u2014 S/ ${Number(order.totalPen).toFixed(2)}`,
        html: buildOrderNotificationEmail(order),
      }).catch(console.error);

      return reply.send({ success: true, orderId: order.id });
    } catch (err: any) {
      app.log.error({ err }, 'Culqi charge failed');
      return reply.code(500).send({
        success: false,
        message: 'Error al procesar el pago',
      });
    }
  });

  // ââ POST /api/auth/refresh â refresh JWT tokens âââââââââââââââââââââââââââ
  app.post('/auth/refresh', async (req, reply) => {
    const { refreshToken } = req.body as { refreshToken: string };
    if (!refreshToken) {
      return reply.code(400).send({ error: 'MISSING_TOKEN', message: 'Refresh token required' });
    }

    // @ts-ignore — jsonwebtoken is available at runtime
    // @ts-expect-error jsonwebtoken has no type declarations
    const jwt = await import('jsonwebtoken');
    try {
      const decoded = jwt.verify(refreshToken, config.JWT_PUBLIC_KEY, {
        algorithms: ['RS256'],
      }) as any;

      const accessToken = jwt.sign(
        { sub: decoded.sub, email: decoded.email, type: decoded.type ?? 'B2C' },
        config.JWT_PRIVATE_KEY,
        { algorithm: 'RS256', expiresIn: config.JWT_ACCESS_EXPIRES_IN },
      );
      const newRefreshToken = jwt.sign(
        { sub: decoded.sub, email: decoded.email, type: decoded.type ?? 'B2C' },
        config.JWT_PRIVATE_KEY,
        { algorithm: 'RS256', expiresIn: config.JWT_REFRESH_EXPIRES_IN },
      );

      return reply.send({ accessToken, refreshToken: newRefreshToken });
    } catch {
      return reply.code(401).send({ error: 'INVALID_TOKEN', message: 'Invalid refresh token' });
    }
  });

  // ââ GET /api/orders â list user's orders (requires auth token) ââââââââââââ
  app.get('/orders', async (req, reply) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return reply.code(401).send({ error: 'UNAUTHORIZED', message: 'Token required' });
    }

    // @ts-expect-error jsonwebtoken has no type declarations
    const jwt = await import('jsonwebtoken');
    try {
      const token = authHeader.replace('Bearer ', '');
      const decoded = jwt.verify(token, config.JWT_PUBLIC_KEY, {
        algorithms: ['RS256'],
      }) as any;

      const orders = await prisma.salesOrder.findMany({
        where: {
          ecommerceCustomerEmail: decoded.email,
          channel: 'ECOMMERCE',
        },
        include: { lines: { include: { product: true } } },
        orderBy: { createdAt: 'desc' },
      });
      return reply.send({ data: orders });
    } catch {
      return reply.code(401).send({ error: 'INVALID_TOKEN', message: 'Invalid token' });
    }
  });
}

// ââ Helper: order notification email for ops team ââââââââââââââââââââââââââââ
function buildOrderNotificationEmail(order: any): string {
  const lines = (order.lines ?? [])
    .map(
      (l: any) =>
        `<tr><td style="padding:6px 12px;border-bottom:1px solid #f3f4f6;">${l.product?.name ?? ''}</td>
         <td style="padding:6px 12px;text-align:center;border-bottom:1px solid #f3f4f6;">${l.qty}</td>
         <td style="padding:6px 12px;text-align:right;border-bottom:1px solid #f3f4f6;">S/ ${Number(l.unitPrice).toFixed(2)}</td></tr>`,
    )
    .join('');

  return `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
    <div style="background:#4f46e5;padding:20px 24px;border-radius:8px 8px 0 0;">
      <h1 style="margin:0;color:#fff;font-size:20px;">Nuevo pedido ecommerce</h1>
      <p style="margin:4px 0 0;color:#c7d2fe;font-size:14px;">#${order.orderNumber}</p>
    </div>
    <div style="background:#fff;padding:24px;border:1px solid #e5e7eb;border-radius:0 0 8px 8px;">
      <p><strong>Cliente:</strong> ${order.ecommerceCustomerEmail ?? '\u2014'}</p>
      <p><strong>Tel:</strong> ${order.ecommerceCustomerPhone ?? '\u2014'}</p>
      <p><strong>Total:</strong> S/ ${Number(order.totalPen).toFixed(2)}</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px;margin-top:12px;">
        <thead><tr style="background:#f9fafb;">
          <th style="padding:8px 12px;text-align:left;">Producto</th>
          <th style="padding:8px 12px;text-align:center;">Cant.</th>
          <th style="padding:8px 12px;text-align:right;">Precio</th>
        </tr></thead>
        <tbody>${lines}</tbody>
      </table>
      <div style="margin-top:16px;">
        <a href="https://erp-rpjk.vercel.app/sales" style="background:#4f46e5;color:#fff;text-decoration:none;padding:10px 20px;border-radius:6px;font-size:14px;">Ver en ERP</a>
      </div>
    </div>
  </div>`;
}
