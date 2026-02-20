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
var OrdersService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.OrdersService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../database/prisma.service");
let OrdersService = OrdersService_1 = class OrdersService {
    prisma;
    logger = new common_1.Logger(OrdersService_1.name);
    constructor(prisma) {
        this.prisma = prisma;
    }
    async listOrders(userId, query) {
        const { page, limit, status } = query;
        const skip = (page - 1) * limit;
        const [orders, total] = await Promise.all([
            this.prisma.order.findMany({
                where: {
                    userId,
                    ...(status ? { status: status } : {}),
                },
                include: {
                    items: true,
                    payments: { select: { status: true, culqiChargeId: true, amountCentimos: true } },
                    invoice: { select: { s3Url: true, series: true, number: true, type: true } },
                },
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit,
            }),
            this.prisma.order.count({
                where: { userId, ...(status ? { status: status } : {}) },
            }),
        ]);
        return {
            data: orders,
            meta: { page, limit, total, pages: Math.ceil(total / limit) },
        };
    }
    async getOrder(orderId, userId) {
        const order = await this.prisma.order.findUnique({
            where: { id: orderId },
            include: {
                items: true,
                payments: true,
                statusHistory: { orderBy: { createdAt: 'asc' } },
                address: true,
                invoice: true,
            },
        });
        if (!order)
            throw new common_1.NotFoundException('Order not found');
        if (userId && order.userId && order.userId !== userId) {
            throw new common_1.ForbiddenException('Access denied');
        }
        return order;
    }
    async getStatusHistory(orderId, userId) {
        await this.getOrder(orderId, userId);
        return this.prisma.orderStatusHistory.findMany({
            where: { orderId },
            orderBy: { createdAt: 'asc' },
        });
    }
    async updateStatus(orderId, dto, changedBy = 'admin') {
        const order = await this.prisma.order.findUnique({ where: { id: orderId } });
        if (!order)
            throw new common_1.NotFoundException('Order not found');
        await this.prisma.$transaction(async (tx) => {
            await tx.order.update({
                where: { id: orderId },
                data: { status: dto.status },
            });
            await tx.orderStatusHistory.create({
                data: { orderId, status: dto.status, note: dto.note, changedBy },
            });
            if (dto.status === 'CANCELLED') {
                const dateStr = order.deliveryDate.toISOString().slice(0, 10);
                await tx.deliverySlot.updateMany({
                    where: {
                        date: new Date(`${dateStr}T00:00:00Z`),
                        window: order.deliveryWindow,
                        bookedOrders: { gt: 0 },
                    },
                    data: { bookedOrders: { decrement: 1 } },
                });
            }
        });
        this.logger.log(`Order ${orderId} status → ${dto.status} by ${changedBy}`);
        return this.getOrder(orderId);
    }
    async listAllOrders(query) {
        const { page, limit, status } = query;
        const skip = (page - 1) * limit;
        const [orders, total] = await Promise.all([
            this.prisma.order.findMany({
                where: status ? { status: status } : {},
                include: {
                    items: true,
                    payments: { select: { status: true, culqiChargeId: true } },
                    user: { select: { email: true, fullName: true } },
                },
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit,
            }),
            this.prisma.order.count({ where: status ? { status: status } : {} }),
        ]);
        return { data: orders, meta: { page, limit, total, pages: Math.ceil(total / limit) } };
    }
};
exports.OrdersService = OrdersService;
exports.OrdersService = OrdersService = OrdersService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], OrdersService);
//# sourceMappingURL=orders.service.js.map