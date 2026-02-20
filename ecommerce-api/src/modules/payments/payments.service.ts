import {
  Injectable, BadRequestException, NotFoundException,
  Logger, UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';
import { CartService } from '../cart/cart.service';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { QUEUES, JOBS } from '../../queue/queues';
import type { Env } from '../../config/configuration';
import type { ChargeDto } from './payments.dto';
import Decimal from 'decimal.js';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma:     PrismaService,
    private readonly cart:       CartService,
    private readonly config:     ConfigService<Env>,
    @InjectQueue(QUEUES.EMAIL)   private readonly emailQueue:   Queue,
    @InjectQueue(QUEUES.INVOICE) private readonly invoiceQueue: Queue,
  ) {}

  // ─── Charge via Culqi token ───────────────────────────────────────────────

  async chargeOrder(dto: ChargeDto, userId?: string) {
    // Load order
    const order = await this.prisma.order.findUnique({
      where:   { id: dto.orderId },
      include: { items: true, payments: true },
    });

    if (!order) throw new NotFoundException('Order not found');
    if (order.status !== 'PENDING_PAYMENT') {
      throw new BadRequestException(`Order is already ${order.status}`);
    }
    if (userId && order.userId && order.userId !== userId) {
      throw new BadRequestException('Order does not belong to this user');
    }

    const payment = order.payments.find((p) => p.status === 'PENDING');
    if (!payment) throw new UnprocessableEntityException('No pending payment found for this order');

    const secret = this.config.get<string>('CULQI_SECRET_KEY', { infer: true })!;

    // Build Culqi charge payload
    const chargePayload: Record<string, unknown> = {
      amount:        payment.amountCentimos,
      currency_code: 'PEN',
      email:         dto.email,
      source_id:     dto.culqiToken,
      description:   `victorsdou ${order.orderNumber}`,
      capture:       true,
      metadata:      { orderId: order.id, orderNumber: order.orderNumber },
    };

    let culqiRes: any;
    let chargeSucceeded = false;
    let failureReason: string | undefined;
    let culqiChargeId: string | undefined;

    try {
      const res = await fetch('https://api.culqi.com/v2/charges', {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${secret}`,
        },
        body: JSON.stringify(chargePayload),
      });

      culqiRes = await res.json();

      if (culqiRes.object === 'error') {
        failureReason  = culqiRes.user_message ?? culqiRes.merchant_message ?? 'Payment declined';
        chargeSucceeded = false;
      } else if (culqiRes.outcome?.type === 'venta_exitosa' || culqiRes.paid === true) {
        chargeSucceeded = true;
        culqiChargeId   = culqiRes.id;
      } else {
        failureReason   = culqiRes.outcome?.user_message ?? 'Payment not authorised';
        chargeSucceeded = false;
      }
    } catch (err) {
      throw new UnprocessableEntityException(`Payment gateway unreachable: ${err}`);
    }

    // ── Update DB based on outcome ───────────────────────────────────────────
    if (chargeSucceeded) {
      await this.prisma.$transaction(async (tx) => {
        // Mark payment succeeded
        await tx.payment.update({
          where: { id: payment.id },
          data:  { status: 'SUCCEEDED', culqiChargeId, updatedAt: new Date() },
        });

        // Advance order to PAID
        await tx.order.update({
          where: { id: order.id },
          data:  { status: 'PAID' },
        });

        // Append status history
        await tx.orderStatusHistory.create({
          data: { orderId: order.id, status: 'PAID', changedBy: 'system', note: `Culqi charge ${culqiChargeId}` },
        });

        // Clear the user's cart
        if (userId || order.userId) {
          const cart = await tx.cart.findUnique({ where: { userId: userId ?? order.userId! } });
          if (cart) await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
        }
      });

      // Queue invoice generation + order confirmation email
      await this.invoiceQueue.add(JOBS.INVOICE.GENERATE, { orderId: order.id });
      await this.emailQueue.add(JOBS.EMAIL.ORDER_CONFIRMATION, {
        orderId: order.id,
        email:   dto.email,
      }, { attempts: 3, backoff: { type: 'exponential', delay: 5000 } });

      return { success: true, orderNumber: order.orderNumber, message: 'Payment successful' };
    } else {
      // Mark payment failed
      await this.prisma.payment.update({
        where: { id: payment.id },
        data:  { status: 'FAILED', failureReason, updatedAt: new Date() },
      });

      // Create a fresh PENDING payment for retry
      await this.prisma.payment.create({
        data: {
          orderId:        order.id,
          amountCentimos: payment.amountCentimos,
          culqiOrderId:   payment.culqiOrderId,
          status:         'PENDING',
        },
      });

      throw new UnprocessableEntityException(failureReason ?? 'Payment failed');
    }
  }

  // ─── Culqi webhook ────────────────────────────────────────────────────────

  async handleWebhook(rawBody: Buffer, signature: string, payload: any) {
    // Verify Culqi signature (HMAC-SHA256 of raw body with webhook secret)
    const webhookSecret = this.config.get<string>('CULQI_WEBHOOK_SECRET', { infer: true })!;

    const crypto = await import('crypto');
    const expected = crypto
      .createHmac('sha256', webhookSecret)
      .update(rawBody)
      .digest('hex');

    if (expected !== signature) {
      this.logger.warn('Culqi webhook signature mismatch');
      throw new BadRequestException('Invalid webhook signature');
    }

    const eventType: string = payload.type ?? '';

    this.logger.log(`Culqi webhook: ${eventType}`);

    switch (eventType) {
      case 'charge.succeeded': {
        const chargeId = payload.data?.object?.id as string | undefined;
        if (chargeId) await this.handleChargeSucceeded(chargeId);
        break;
      }
      case 'charge.failed': {
        const chargeId = payload.data?.object?.id as string | undefined;
        const reason   = payload.data?.object?.outcome?.user_message as string | undefined;
        if (chargeId) await this.handleChargeFailed(chargeId, reason);
        break;
      }
      case 'charge.refunded': {
        const chargeId = payload.data?.object?.id as string | undefined;
        if (chargeId) await this.handleChargeRefunded(chargeId);
        break;
      }
      default:
        this.logger.debug(`Unhandled Culqi event: ${eventType}`);
    }

    return { received: true };
  }

  private async handleChargeSucceeded(culqiChargeId: string) {
    const payment = await this.prisma.payment.findUnique({ where: { culqiChargeId } });
    if (!payment || payment.status === 'SUCCEEDED') return;

    await this.prisma.$transaction(async (tx) => {
      await tx.payment.update({ where: { id: payment.id }, data: { status: 'SUCCEEDED' } });
      await tx.order.update({ where: { id: payment.orderId }, data: { status: 'PAID' } });
      await tx.orderStatusHistory.create({
        data: { orderId: payment.orderId, status: 'PAID', changedBy: 'culqi-webhook' },
      });
    });

    await this.invoiceQueue.add(JOBS.INVOICE.GENERATE, { orderId: payment.orderId });
  }

  private async handleChargeFailed(culqiChargeId: string, reason?: string) {
    const payment = await this.prisma.payment.findUnique({ where: { culqiChargeId } });
    if (!payment) return;
    await this.prisma.payment.update({
      where: { id: payment.id },
      data:  { status: 'FAILED', failureReason: reason },
    });
  }

  private async handleChargeRefunded(culqiChargeId: string) {
    const payment = await this.prisma.payment.findUnique({ where: { culqiChargeId } });
    if (!payment) return;

    await this.prisma.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id: payment.id },
        data:  { status: 'REFUNDED', refundedAt: new Date() },
      });
      await tx.order.update({ where: { id: payment.orderId }, data: { status: 'REFUNDED' } });
      await tx.orderStatusHistory.create({
        data: { orderId: payment.orderId, status: 'REFUNDED', changedBy: 'culqi-webhook' },
      });
    });
  }
}
