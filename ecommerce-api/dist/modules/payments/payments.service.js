"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var PaymentsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PaymentsService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const prisma_service_1 = require("../../database/prisma.service");
const cart_service_1 = require("../cart/cart.service");
const bullmq_1 = require("@nestjs/bullmq");
const queues_1 = require("../../queue/queues");
let PaymentsService = PaymentsService_1 = class PaymentsService {
    prisma;
    cart;
    config;
    emailQueue;
    invoiceQueue;
    logger = new common_1.Logger(PaymentsService_1.name);
    constructor(prisma, cart, config, emailQueue, invoiceQueue) {
        this.prisma = prisma;
        this.cart = cart;
        this.config = config;
        this.emailQueue = emailQueue;
        this.invoiceQueue = invoiceQueue;
    }
    async chargeOrder(dto, userId) {
        const order = await this.prisma.order.findUnique({
            where: { id: dto.orderId },
            include: { items: true, payments: true },
        });
        if (!order)
            throw new common_1.NotFoundException('Order not found');
        if (order.status !== 'PENDING_PAYMENT') {
            throw new common_1.BadRequestException(`Order is already ${order.status}`);
        }
        if (userId && order.userId && order.userId !== userId) {
            throw new common_1.BadRequestException('Order does not belong to this user');
        }
        const payment = order.payments.find((p) => p.status === 'PENDING');
        if (!payment)
            throw new common_1.UnprocessableEntityException('No pending payment found for this order');
        const secret = this.config.get('CULQI_SECRET_KEY', { infer: true });
        const chargePayload = {
            amount: payment.amountCentimos,
            currency_code: 'PEN',
            email: dto.email,
            source_id: dto.culqiToken,
            description: `victorsdou ${order.orderNumber}`,
            capture: true,
            metadata: { orderId: order.id, orderNumber: order.orderNumber },
        };
        let culqiRes;
        let chargeSucceeded = false;
        let failureReason;
        let culqiChargeId;
        try {
            const res = await fetch('https://api.culqi.com/v2/charges', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${secret}`,
                },
                body: JSON.stringify(chargePayload),
            });
            culqiRes = await res.json();
            if (culqiRes.object === 'error') {
                failureReason = culqiRes.user_message ?? culqiRes.merchant_message ?? 'Payment declined';
                chargeSucceeded = false;
            }
            else if (culqiRes.outcome?.type === 'venta_exitosa' || culqiRes.paid === true) {
                chargeSucceeded = true;
                culqiChargeId = culqiRes.id;
            }
            else {
                failureReason = culqiRes.outcome?.user_message ?? 'Payment not authorised';
                chargeSucceeded = false;
            }
        }
        catch (err) {
            throw new common_1.UnprocessableEntityException(`Payment gateway unreachable: ${err}`);
        }
        if (chargeSucceeded) {
            await this.prisma.$transaction(async (tx) => {
                await tx.payment.update({
                    where: { id: payment.id },
                    data: { status: 'SUCCEEDED', culqiChargeId, updatedAt: new Date() },
                });
                await tx.order.update({
                    where: { id: order.id },
                    data: { status: 'PAID' },
                });
                await tx.orderStatusHistory.create({
                    data: { orderId: order.id, status: 'PAID', changedBy: 'system', note: `Culqi charge ${culqiChargeId}` },
                });
                if (userId || order.userId) {
                    const cart = await tx.cart.findUnique({ where: { userId: userId ?? order.userId } });
                    if (cart)
                        await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
                }
            });
            await this.invoiceQueue.add(queues_1.JOBS.INVOICE.GENERATE, { orderId: order.id });
            await this.emailQueue.add(queues_1.JOBS.EMAIL.ORDER_CONFIRMATION, {
                orderId: order.id,
                email: dto.email,
            }, { attempts: 3, backoff: { type: 'exponential', delay: 5000 } });
            return { success: true, orderNumber: order.orderNumber, message: 'Payment successful' };
        }
        else {
            await this.prisma.payment.update({
                where: { id: payment.id },
                data: { status: 'FAILED', failureReason, updatedAt: new Date() },
            });
            await this.prisma.payment.create({
                data: {
                    orderId: order.id,
                    amountCentimos: payment.amountCentimos,
                    culqiOrderId: payment.culqiOrderId,
                    status: 'PENDING',
                },
            });
            throw new common_1.UnprocessableEntityException(failureReason ?? 'Payment failed');
        }
    }
    async handleWebhook(rawBody, signature, payload) {
        const webhookSecret = this.config.get('CULQI_WEBHOOK_SECRET', { infer: true });
        const crypto = await import('crypto');
        const expected = crypto
            .createHmac('sha256', webhookSecret)
            .update(rawBody)
            .digest('hex');
        if (expected !== signature) {
            this.logger.warn('Culqi webhook signature mismatch');
            throw new common_1.BadRequestException('Invalid webhook signature');
        }
        const eventType = payload.type ?? '';
        this.logger.log(`Culqi webhook: ${eventType}`);
        switch (eventType) {
            case 'charge.succeeded': {
                const chargeId = payload.data?.object?.id;
                if (chargeId)
                    await this.handleChargeSucceeded(chargeId);
                break;
            }
            case 'charge.failed': {
                const chargeId = payload.data?.object?.id;
                const reason = payload.data?.object?.outcome?.user_message;
                if (chargeId)
                    await this.handleChargeFailed(chargeId, reason);
                break;
            }
            case 'charge.refunded': {
                const chargeId = payload.data?.object?.id;
                if (chargeId)
                    await this.handleChargeRefunded(chargeId);
                break;
            }
            default:
                this.logger.debug(`Unhandled Culqi event: ${eventType}`);
        }
        return { received: true };
    }
    async handleChargeSucceeded(culqiChargeId) {
        const payment = await this.prisma.payment.findUnique({ where: { culqiChargeId } });
        if (!payment || payment.status === 'SUCCEEDED')
            return;
        await this.prisma.$transaction(async (tx) => {
            await tx.payment.update({ where: { id: payment.id }, data: { status: 'SUCCEEDED' } });
            await tx.order.update({ where: { id: payment.orderId }, data: { status: 'PAID' } });
            await tx.orderStatusHistory.create({
                data: { orderId: payment.orderId, status: 'PAID', changedBy: 'culqi-webhook' },
            });
        });
        await this.invoiceQueue.add(queues_1.JOBS.INVOICE.GENERATE, { orderId: payment.orderId });
    }
    async handleChargeFailed(culqiChargeId, reason) {
        const payment = await this.prisma.payment.findUnique({ where: { culqiChargeId } });
        if (!payment)
            return;
        await this.prisma.payment.update({
            where: { id: payment.id },
            data: { status: 'FAILED', failureReason: reason },
        });
    }
    async handleChargeRefunded(culqiChargeId) {
        const payment = await this.prisma.payment.findUnique({ where: { culqiChargeId } });
        if (!payment)
            return;
        await this.prisma.$transaction(async (tx) => {
            await tx.payment.update({
                where: { id: payment.id },
                data: { status: 'REFUNDED', refundedAt: new Date() },
            });
            await tx.order.update({ where: { id: payment.orderId }, data: { status: 'REFUNDED' } });
            await tx.orderStatusHistory.create({
                data: { orderId: payment.orderId, status: 'REFUNDED', changedBy: 'culqi-webhook' },
            });
        });
    }
};
exports.PaymentsService = PaymentsService;
exports.PaymentsService = PaymentsService = PaymentsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(3, (0, bullmq_1.InjectQueue)(queues_1.QUEUES.EMAIL)),
    __param(4, (0, bullmq_1.InjectQueue)(queues_1.QUEUES.INVOICE)),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        cart_service_1.CartService,
        config_1.ConfigService, Function, Function])
], PaymentsService);
//# sourceMappingURL=payments.service.js.map