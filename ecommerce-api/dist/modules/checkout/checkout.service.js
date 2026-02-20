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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var CheckoutService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.CheckoutService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const prisma_service_1 = require("../../database/prisma.service");
const cart_service_1 = require("../cart/cart.service");
const decimal_js_1 = __importDefault(require("decimal.js"));
let CheckoutService = CheckoutService_1 = class CheckoutService {
    prisma;
    cart;
    config;
    logger = new common_1.Logger(CheckoutService_1.name);
    culqiSecret;
    constructor(prisma, cart, config) {
        this.prisma = prisma;
        this.cart = cart;
        this.config = config;
        this.culqiSecret = this.config.get('CULQI_SECRET_KEY', { infer: true }) ?? '';
    }
    async getAvailableSlots(from, to) {
        const fromDate = new Date(`${from}T00:00:00Z`);
        const toDate = new Date(`${to}T23:59:59Z`);
        const existingSlots = await this.prisma.deliverySlot.findMany({
            where: { date: { gte: fromDate, lte: toDate } },
        });
        const slotMap = new Map(existingSlots.map((s) => [`${s.date.toISOString().slice(0, 10)}|${s.window}`, s]));
        const slots = [];
        const cursor = new Date(fromDate);
        while (cursor <= toDate) {
            const dateStr = cursor.toISOString().slice(0, 10);
            for (const window of ['MORNING', 'AFTERNOON']) {
                const existing = slotMap.get(`${dateStr}|${window}`);
                const max = existing?.maxOrders ?? 50;
                const booked = existing?.bookedOrders ?? 0;
                const blocked = existing?.isBlocked ?? false;
                const remaining = Math.max(0, max - booked);
                slots.push({ date: dateStr, window, available: !blocked && remaining > 0, remaining });
            }
            cursor.setUTCDate(cursor.getUTCDate() + 1);
        }
        return slots;
    }
    async validateCart(cartOpts, deliveryDate, deliveryWindow) {
        const cartData = await this.cart.getCart(cartOpts);
        if (!cartData.cartId || cartData.items.length === 0) {
            throw new common_1.BadRequestException('Cart is empty');
        }
        const slot = await this.prisma.deliverySlot.findUnique({
            where: { date_window: { date: new Date(`${deliveryDate}T00:00:00Z`), window: deliveryWindow } },
        });
        const slotAvailable = !slot || (!slot.isBlocked && slot.bookedOrders < slot.maxOrders);
        if (!slotAvailable) {
            throw new common_1.ConflictException(`Delivery slot ${deliveryDate} ${deliveryWindow} is full or blocked`);
        }
        return {
            valid: true,
            cartId: cartData.cartId,
            items: cartData.items,
            subtotalExIgv: cartData.subtotalExIgv,
            igvTotal: cartData.igvTotal,
            total: cartData.total,
            slotAvailable,
        };
    }
    async initiateCheckout(cartOpts, dto) {
        const validation = await this.validateCart(cartOpts, dto.deliveryDate, dto.deliveryWindow);
        let addressSnap = null;
        let addressId;
        if (dto.addressId) {
            const addr = await this.prisma.webUserAddress.findUnique({ where: { id: dto.addressId } });
            if (!addr)
                throw new common_1.NotFoundException('Address not found');
            addressId = addr.id;
            addressSnap = { ...addr };
        }
        else if (dto.inlineAddress) {
            addressSnap = dto.inlineAddress;
        }
        const dateTag = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const todayCount = await this.prisma.order.count({
            where: { orderNumber: { startsWith: `ORD-${dateTag}-` } },
        });
        const orderNumber = `ORD-${dateTag}-${String(todayCount + 1).padStart(4, '0')}`;
        const subtotal = new decimal_js_1.default(validation.subtotalExIgv);
        const igvAmt = new decimal_js_1.default(validation.igvTotal);
        const total = subtotal.plus(igvAmt);
        const amountCentimos = total.times(100).toDecimalPlaces(0, decimal_js_1.default.ROUND_HALF_UP).toNumber();
        const order = await this.prisma.$transaction(async (tx) => {
            const created = await tx.order.create({
                data: {
                    orderNumber,
                    userId: cartOpts.userId,
                    guestEmail: dto.guestEmail,
                    guestPhone: dto.guestPhone,
                    addressId,
                    deliveryAddressSnap: addressSnap ?? undefined,
                    deliveryDate: new Date(`${dto.deliveryDate}T00:00:00Z`),
                    deliveryWindow: dto.deliveryWindow,
                    subtotalExIgv: subtotal.toDecimalPlaces(4),
                    igvAmount: igvAmt.toDecimalPlaces(4),
                    totalPen: total.toDecimalPlaces(4),
                    status: 'PENDING_PAYMENT',
                    notes: dto.notes,
                    promoCode: dto.promoCode,
                    items: {
                        create: validation.items.map((item) => ({
                            erpProductId: item.erpProductId,
                            sku: item.sku,
                            name: item.name,
                            qty: item.qty,
                            unitPrice: parseFloat(item.unitPrice),
                            igvRate: 0.18,
                            lineTotal: parseFloat(item.lineTotal),
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
                where: { date_window: { date: new Date(`${dto.deliveryDate}T00:00:00Z`), window: dto.deliveryWindow } },
                update: { bookedOrders: { increment: 1 } },
                create: { date: new Date(`${dto.deliveryDate}T00:00:00Z`), window: dto.deliveryWindow, maxOrders: 50, bookedOrders: 1 },
            });
            return created;
        });
        let culqiOrderId = null;
        try {
            culqiOrderId = await this.createCulqiOrder(order.id, amountCentimos, dto.guestEmail ?? '');
            await this.prisma.payment.updateMany({
                where: { orderId: order.id, status: 'PENDING' },
                data: { culqiOrderId },
            });
        }
        catch (err) {
            this.logger.warn(`Culqi order creation failed for order ${order.id}: ${err}`);
        }
        return {
            orderId: order.id,
            orderNumber: order.orderNumber,
            amountCentimos,
            culqiOrderId,
            culqiPublicKey: this.config.get('CULQI_PUBLIC_KEY', { infer: true }),
            items: order.items,
        };
    }
    async createCulqiOrder(orderId, amountCentimos, email) {
        const payload = {
            amount: amountCentimos,
            currency_code: 'PEN',
            description: `victorsdou orden ${orderId}`,
            order_number: orderId,
            client_details: { first_name: '', last_name: '', email: email || 'guest@victorsdou.pe', phone_number: '' },
            expiration_date: Math.floor(Date.now() / 1000) + 3600,
            confirm: false,
        };
        const res = await fetch('https://api.culqi.com/v2/orders', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.culqiSecret}`,
            },
            body: JSON.stringify(payload),
        });
        if (!res.ok) {
            const body = await res.text();
            throw new Error(`Culqi order creation failed: ${res.status} ${body}`);
        }
        const data = await res.json();
        return data.id;
    }
    async createDirectOrder(payload) {
        const subtotal = payload.items.reduce((s, i) => s.plus(new decimal_js_1.default(i.unitPrice).times(i.qty)), new decimal_js_1.default(0));
        const igvAmt = payload.items.reduce((s, i) => s.plus(new decimal_js_1.default(i.unitPrice).times(i.igvRate).times(i.qty)), new decimal_js_1.default(0));
        const total = subtotal.plus(igvAmt);
        const amountCentimos = total.times(100).toDecimalPlaces(0, decimal_js_1.default.ROUND_HALF_UP).toNumber();
        const dateTag = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const todayCount = await this.prisma.order.count({
            where: { orderNumber: { startsWith: `ORD-${dateTag}-` } },
        });
        const orderNumber = `ORD-${dateTag}-${String(todayCount + 1).padStart(4, '0')}`;
        const order = await this.prisma.$transaction(async (tx) => {
            const created = await tx.order.create({
                data: {
                    orderNumber,
                    userId: payload.userId,
                    guestEmail: payload.guestEmail,
                    guestPhone: payload.guestPhone,
                    addressId: payload.addressId,
                    deliveryAddressSnap: payload.addressSnap,
                    deliveryDate: new Date(`${payload.deliveryDate}T00:00:00Z`),
                    deliveryWindow: payload.deliveryWindow,
                    subtotalExIgv: subtotal.toDecimalPlaces(4),
                    igvAmount: igvAmt.toDecimalPlaces(4),
                    totalPen: total.toDecimalPlaces(4),
                    status: 'PENDING_PAYMENT',
                    notes: payload.notes,
                    promoCode: payload.promoCode,
                    items: {
                        create: payload.items.map((item) => ({
                            erpProductId: item.erpProductId,
                            sku: item.sku,
                            name: item.name,
                            qty: item.qty,
                            unitPrice: item.unitPrice,
                            igvRate: item.igvRate,
                            lineTotal: new decimal_js_1.default(item.unitPrice).times(1 + item.igvRate).times(item.qty).toDecimalPlaces(4).toNumber(),
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
                where: { date_window: { date: new Date(`${payload.deliveryDate}T00:00:00Z`), window: payload.deliveryWindow } },
                update: { bookedOrders: { increment: 1 } },
                create: { date: new Date(`${payload.deliveryDate}T00:00:00Z`), window: payload.deliveryWindow, maxOrders: 50, bookedOrders: 1 },
            });
            return created;
        });
        return { orderId: order.id, orderNumber, amountCentimos, items: order.items };
    }
};
exports.CheckoutService = CheckoutService;
exports.CheckoutService = CheckoutService = CheckoutService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        cart_service_1.CartService,
        config_1.ConfigService])
], CheckoutService);
//# sourceMappingURL=checkout.service.js.map