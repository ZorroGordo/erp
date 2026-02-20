import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class SubscriptionsService {
  constructor(private readonly prisma: PrismaService) {}

  /** List subscriptions for a user (excludes cancelled by default). */
  async listForUser(userId: string) {
    const subs = await this.prisma.subscription.findMany({
      where:   { userId, status: { not: 'CANCELLED' } },
      include: { items: true },
      orderBy: { createdAt: 'desc' },
    });
    return { data: subs };
  }

  /** Pause an active subscription. */
  async pause(id: string, userId: string) {
    const sub = await this.prisma.subscription.findUnique({ where: { id } });
    if (!sub)               throw new NotFoundException('Suscripción no encontrada');
    if (sub.userId !== userId) throw new ForbiddenException('Acceso denegado');
    if (sub.status !== 'ACTIVE') {
      throw new ForbiddenException(`No se puede pausar una suscripción en estado ${sub.status}`);
    }
    return this.prisma.subscription.update({
      where: { id },
      data:  { status: 'PAUSED' },
      include: { items: true },
    });
  }

  /** Cancel a subscription. */
  async cancel(id: string, userId: string) {
    const sub = await this.prisma.subscription.findUnique({ where: { id } });
    if (!sub)               throw new NotFoundException('Suscripción no encontrada');
    if (sub.userId !== userId) throw new ForbiddenException('Acceso denegado');
    return this.prisma.subscription.update({
      where: { id },
      data:  { status: 'CANCELLED', cancelledAt: new Date() },
      include: { items: true },
    });
  }
}
