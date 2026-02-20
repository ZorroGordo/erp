import {
  Injectable, NotFoundException, ForbiddenException, Logger,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import type { UpdateOrderStatusDto, ListOrdersQueryDto } from './orders.dto';
import type { OrderStatus } from '@prisma/client';

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ─── List orders for a user ───────────────────────────────────────────────

  async listOrders(userId: string, query: ListOrdersQueryDto) {
    const { page, limit, status } = query;
    const skip = (page - 1) * limit;

    const [orders, total] = await Promise.all([
      this.prisma.order.findMany({
        where: {
          userId,
          ...(status ? { status: status as OrderStatus } : {}),
        },
        include: {
          items:    true,
          payments: { select: { status: true, culqiChargeId: true, amountCentimos: true } },
          invoice:  { select: { s3Url: true, series: true, number: true, type: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.order.count({
        where: { userId, ...(status ? { status: status as OrderStatus } : {}) },
      }),
    ]);

    return {
      data:  orders,
      meta:  { page, limit, total, pages: Math.ceil(total / limit) },
    };
  }

  // ─── Get single order ─────────────────────────────────────────────────────

  async getOrder(orderId: string, userId?: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items:         true,
        payments:      true,
        statusHistory: { orderBy: { createdAt: 'asc' } },
        address:       true,
        invoice:       true,
      },
    });

    if (!order) throw new NotFoundException('Order not found');

    // If caller is a regular user (not admin), enforce ownership
    if (userId && order.userId && order.userId !== userId) {
      throw new ForbiddenException('Access denied');
    }

    return order;
  }

  // ─── Get order status history ─────────────────────────────────────────────

  async getStatusHistory(orderId: string, userId?: string) {
    // Verify access first
    await this.getOrder(orderId, userId);
    return this.prisma.orderStatusHistory.findMany({
      where:   { orderId },
      orderBy: { createdAt: 'asc' },
    });
  }

  // ─── Admin: update order status ───────────────────────────────────────────

  async updateStatus(orderId: string, dto: UpdateOrderStatusDto, changedBy = 'admin') {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');

    await this.prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: orderId },
        data:  { status: dto.status as OrderStatus },
      });
      await tx.orderStatusHistory.create({
        data: { orderId, status: dto.status as OrderStatus, note: dto.note, changedBy },
      });

      // If cancelled, release the delivery slot
      if (dto.status === 'CANCELLED') {
        const dateStr = order.deliveryDate.toISOString().slice(0, 10);
        await tx.deliverySlot.updateMany({
          where: {
            date:   new Date(`${dateStr}T00:00:00Z`),
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

  // ─── Admin: list all orders ───────────────────────────────────────────────

  async listAllOrders(query: ListOrdersQueryDto) {
    const { page, limit, status } = query;
    const skip = (page - 1) * limit;

    const [orders, total] = await Promise.all([
      this.prisma.order.findMany({
        where:   status ? { status: status as OrderStatus } : {},
        include: {
          items:    true,
          payments: { select: { status: true, culqiChargeId: true } },
          user:     { select: { email: true, fullName: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.order.count({ where: status ? { status: status as OrderStatus } : {} }),
    ]);

    return { data: orders, meta: { page, limit, total, pages: Math.ceil(total / limit) } };
  }
}
