import {
  Injectable, BadRequestException, NotFoundException,
  ConflictException, Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';
import { CartService } from '../cart/cart.service';
import type { Env } from '../../config/configuration';
import type { InitiateCheckoutDto } from './checkout.dto';
import type { DeliveryWindow, Prisma } from '@prisma/client';
import Decimal from 'decimal.js';

@Injectable()
export class CheckoutService {
  private readonly logger = new Logger(CheckoutService.name);
  private readonly culqiSecret: string;

  constructor(
    private readonly prisma:   PrismaService,
    private readonly cart:     CartService,
    private readonly config:   ConfigService<Env>,
  ) {
    this.culqiSecret = this.config.get('CULQI_SECRET_KEY', { infer: true }) ?? '';
  }

  // ─── Available delivery slots ─────────────────────────────────────────────

  async getAvailableSlots(from: string, to: string) {
    const fromDate = new Date(`${from}T00:00:00Z`);
    const toDate   = new Date(`${to}T23:59:59Z`);

    const existingSlots = await this.prisma.deliverySlot.findMany({
      where: { date: { gte: fromDate, lte: toDate } },
    });

    // Build a map of existing slots keyed by `date|window`
    const slotMap = new Map(existingSlots.map((s) => [`${s.date.toISOString().slice(0, 10)}|${s.window}`, s]));

    // Enumerate all dates in range
    const slots: Array<{
      date: string;
      window: DeliveryWindow;
      available: boolean;
      remaining: number;
    }> = [];

    const cursor = new Date(fromDate);
    while (cursor <= toDate) {
      const dateStr = cursor.toISOString().slice(0, 10);
      for (const window of ['MORNING', 'AFTERNOON'] as DeliveryWindow[]) {
        const existing = slotMap.get(`${dateStr}|${window}`);
        const max      = existing?.maxOrders    ?? 50;
        const booked   = existing?.bookedOrders ?? 0;
        const blocked  = existing?.isBlocked    ?? false;
        const remaining = Math.max(0, max - booked);
        slots.push({ date: dateStr, window, available: !blocked && remaining > 0, remaining });
      }
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    return slots;
  }

  // ─── Validate cart + slot before checkout ─────────────────────────────────

  async validateCart(
    cartOpts:       { userId?: string; guestSessionId?: string; userType?: 'B2C' | 'B2B' | 'GUEST' },
    deliveryDate:   string,
    deliveryWindow: DeliveryWindow,
  ) {
    const cartData = await this.cart.getCart(cartOpts);
    if (!cartData.cartId || cartData.items.length === 0) {
      throw new BadRequestException('Cart is empty');
    }

    // Check slot availability
    const slot = await this.prisma.deliverySlot.findUnique({
      where: { date_window: { date: new Date(`${deliveryDate}T00:00:00Z`), window: deliveryWindow } },
    });
    const slotAvailable = !slot || (!slot.isBlocked && slot.bookedOrders < slot.maxOrders);
    if (!slotAvailable) {
      throw new ConflictException(`Delivery slot ${deliveryDate} ${deliveryWindow} is full or blocked`);
    }

    // Re-validate each product exists in ERP (getCart already re-prices)
    return {
      valid:          true,
      cartId:         cartData.cartId,
      items:          cartData.items,
      subtotalExIgv:  cartData.subtotalExIgv,
      igvTotal:       cartData.igvTotal,
      total:          cartData.total,
      slotAvailable,
    };
  }

  // ─── Initiate checkout → create Order + Culqi order ───────────────────────

  async initiateCheckout(
    cartOpts: { userId?: string; guestSessionId?: string; userType?: 'B2C' | 'B2B' | 'GUEST' },
    dto: InitiateCheckoutDto,
  ) {
    const validation = await this.validateCart(
      cartOpts,
      dto.deliveryDate,
      dto.deliveryWindow as DeliveryWindow,
    );

    // Resolve delivery address snapshot
    let addressSnap: Prisma.JsonObject | null = null;
    let addressId: string | undefined;

    if (dto.addressId) {
      const addr = await this.prisma.webUserAddress.findUnique({ where: { id: dto.addressId } });
      if (!addr) throw new NotFoundException('Address not found');
      addressId   = addr.id;
      addressSnap = { ...addr } as unknown as Prisma.JsonObject;
    } else if (dto.inlineAddress) {
      addressSnap = dto.inlineAddress as unknown as Prisma.JsonObject;
    }

    // Generate order number: ORD-YYYYMMDD-NNNN
    const dateTag    = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const todayCount = await this.prisma.order.count({
      where: { orderNumber: { startsWith: `ORD-${dateTag}-` } },
    });
    const orderNumber = `ORD-${dateTag}-${String(todayCount + 1).padStart(4, '0')}`;

    const subtotal  = new Decimal(validation.subtotalExIgv);
    const igvAmt    = new Decimal(validation.igvTotal);
    const total     = subtotal.plus(igvAmt);
    const amountCentimos = total.times(100).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();

    // ── Create order in DB (PENDING_PAYMENT) ────────────────────────────────
    const order = await this.prisma.$transaction(async (tx) => {
      const created = await tx.order.create({
        data: {
          orderNumber,
          userId:              cartOpts.userId,
          guestEmail:          dto.guestEmail,
          guestPhone:          dto.guestPhone,
          addressId,
          deliveryAddressSnap: addressSnap ?? undefined,
          deliveryDate:        new Date(`${dto.deliveryDate}T00:00:00Z`),
          deliveryWindow:      dto.deliveryWindow as DeliveryWindow,
          subtotalExIgv:       subtotal.toDecimalPlaces(4),
          igvAmount:           igvAmt.toDecimalPlaces(4),
          totalPen:            total.toDecimalPlaces(4),
          status:              'PENDING_PAYMENT',
          notes:               dto.notes,
          promoCode:           dto.promoCode,
          items: {
            create: validation.items.map((item) => ({
              erpProductId: item.erpProductId,
              sku:          item.sku,
              name:         item.name,
              qty:          item.qty,
              unitPrice:    parseFloat(item.unitPrice),
              igvRate:      0.18,
              lineTotal:    parseFloat(item.lineTotal),
            })),
          },
        },
        include: { items: true },
      });

      // Create initial status history entry
      await tx.orderStatusHistory.create({
        data: { orderId: created.id, status: 'PENDING_PAYMENT', changedBy: 'system', note: 'Order created' },
      });

      // Create pending payment record
      await tx.payment.create({
        data: { orderId: created.id, amountCentimos, status: 'PENDING' },
      });

      // Reserve delivery slot (upsert bookedOrders++)
      await tx.deliverySlot.upsert({
        where:  { date_window: { date: new Date(`${dto.deliveryDate}T00:00:00Z`), window: dto.deliveryWindow as DeliveryWindow } },
        update: { bookedOrders: { increment: 1 } },
        create: { date: new Date(`${dto.deliveryDate}T00:00:00Z`), window: dto.deliveryWindow as DeliveryWindow, maxOrders: 50, bookedOrders: 1 },
      });

      return created;
    });

    // ── Create Culqi order ───────────────────────────────────────────────────
    let culqiOrderId: string | null = null;
    try {
      culqiOrderId = await this.createCulqiOrder(order.id, amountCentimos, dto.guestEmail ?? '');
      // Store culqiOrderId on the payment row
      await this.prisma.payment.updateMany({
        where: { orderId: order.id, status: 'PENDING' },
        data:  { culqiOrderId },
      });
    } catch (err) {
      this.logger.warn(`Culqi order creation failed for order ${order.id}: ${err}`);
      // Non-fatal — frontend can still charge with token only
    }

    return {
      orderId:      order.id,
      orderNumber:  order.orderNumber,
      amountCentimos,
      culqiOrderId,
      culqiPublicKey: this.config.get('CULQI_PUBLIC_KEY', { infer: true }),
      items:        order.items,
    };
  }

  // ─── Culqi: create order (pre-authorizes amount, allows 3DS) ─────────────

  private async createCulqiOrder(
    orderId: string,
    amountCentimos: number,
    email: string,
  ): Promise<string> {
    const payload = {
      amount:           amountCentimos,
      currency_code:    'PEN',
      description:      `victorsdou orden ${orderId}`,
      order_number:     orderId,
      client_details:   { first_name: '', last_name: '', email: email || 'guest@victorsdou.pe', phone_number: '' },
      expiration_date:  Math.floor(Date.now() / 1000) + 3600, // 1 hour
      confirm:          false,
    };

    const res = await fetch('https://api.culqi.com/v2/orders', {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${this.culqiSecret}`,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Culqi order creation failed: ${res.status} ${body}`);
    }

    const data: any = await res.json();
    return data.id as string;
  }

  // ─── Direct order (from Next.js frontend — items sent inline) ─────────────
  // Accepts frontend CartItem[] format and creates order directly.

  async createDirectOrder(payload: {
    userId?:        string;
    guestEmail?:    string;
    guestPhone?:    string;
    items: Array<{
      erpProductId: string;
      name:         string;
      sku:          string;
      qty:          number;
      unitPrice:    number;  // pre-IGV
      igvRate:      number;
      isSubscription?: boolean;
    }>;
    deliveryDate:   string;
    deliveryWindow: DeliveryWindow;
    addressSnap:    Prisma.JsonObject;
    addressId?:     string;
    invoiceType?:   string;
    ruc?:           string;
    razonSocial?:   string;
    notes?:         string;
    promoCode?:     string;
  }) {
    const subtotal = payload.items.reduce(
      (s, i) => s.plus(new Decimal(i.unitPrice).times(i.qty)), new Decimal(0),
    );
    const igvAmt = payload.items.reduce(
      (s, i) => s.plus(new Decimal(i.unitPrice).times(i.igvRate).times(i.qty)), new Decimal(0),
    );
    const total          = subtotal.plus(igvAmt);
    const amountCentimos = total.times(100).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();

    // Generate order number
    const dateTag    = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const todayCount = await this.prisma.order.count({
      where: { orderNumber: { startsWith: `ORD-${dateTag}-` } },
    });
    const orderNumber = `ORD-${dateTag}-${String(todayCount + 1).padStart(4, '0')}`;

    const order = await this.prisma.$transaction(async (tx) => {
      const created = await tx.order.create({
        data: {
          orderNumber,
          userId:              payload.userId,
          guestEmail:          payload.guestEmail,
          guestPhone:          payload.guestPhone,
          addressId:           payload.addressId,
          deliveryAddressSnap: payload.addressSnap,
          deliveryDate:        new Date(`${payload.deliveryDate}T00:00:00Z`),
          deliveryWindow:      payload.deliveryWindow,
          subtotalExIgv:       subtotal.toDecimalPlaces(4),
          igvAmount:           igvAmt.toDecimalPlaces(4),
          totalPen:            total.toDecimalPlaces(4),
          status:              'PENDING_PAYMENT',
          notes:               payload.notes,
          promoCode:           payload.promoCode,
          items: {
            create: payload.items.map((item) => ({
              erpProductId: item.erpProductId,
              sku:          item.sku,
              name:         item.name,
              qty:          item.qty,
              unitPrice:    item.unitPrice,
              igvRate:      item.igvRate,
              lineTotal:    new Decimal(item.unitPrice).times(1 + item.igvRate).times(item.qty).toDecimalPlaces(4).toNumber(),
            })),
          },
        },
        include: { items: true },
      });

      await tx.orderStatusHistory.create({
        data: { orderId: created.id, status: 'PENDING_PAYMENT', changedBy: 'system', note: 'Order created' },
      });
      await tx.payment.create({
        data: { orderId: created.id, amountCentimos, status: 'PENDING' },
      });
      await tx.deliverySlot.upsert({
        where:  { date_window: { date: new Date(`${payload.deliveryDate}T00:00:00Z`), window: payload.deliveryWindow } },
        update: { bookedOrders: { increment: 1 } },
        create: { date: new Date(`${payload.deliveryDate}T00:00:00Z`), window: payload.deliveryWindow, maxOrders: 50, bookedOrders: 1 },
      });

      return created;
    });

    return { orderId: order.id, orderNumber, amountCentimos, items: order.items };
  }
}
