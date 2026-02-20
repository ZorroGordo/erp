import {
  Controller, Get, Patch, Body, Param, Query,
  Req, UseGuards, HttpCode, HttpStatus, Headers, ForbiddenException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { OrdersService } from './orders.service';
import { ZodPipe } from '../../common/pipes/zod.pipe';
import {
  UpdateOrderStatusSchema, ListOrdersQuerySchema,
  type UpdateOrderStatusDto, type ListOrdersQueryDto,
} from './orders.dto';
import type { CurrentUserPayload } from '../../common/decorators/current-user.decorator';
import type { Env } from '../../config/configuration';

@Controller('orders')
export class OrdersController {
  constructor(
    private readonly orders: OrdersService,
    private readonly config: ConfigService<Env>,
  ) {}

  /** GET /api/orders — list current user's orders */
  @Get()
  @UseGuards(AuthGuard('jwt'))
  async listMyOrders(
    @Req() req: any,
    @Query(new ZodPipe(ListOrdersQuerySchema)) query: ListOrdersQueryDto,
  ) {
    const user: CurrentUserPayload = req.user;
    return this.orders.listOrders(user.id, query);
  }

  /** GET /api/orders/:id — get order detail (auth user or internal) */
  @Get(':id')
  @UseGuards(AuthGuard('jwt'))
  async getOrder(@Req() req: any, @Param('id') id: string) {
    const user: CurrentUserPayload = req.user;
    return this.orders.getOrder(id, user.id);
  }

  /** GET /api/orders/:id/status-history */
  @Get(':id/status-history')
  @UseGuards(AuthGuard('jwt'))
  async getStatusHistory(@Req() req: any, @Param('id') id: string) {
    const user: CurrentUserPayload = req.user;
    return this.orders.getStatusHistory(id, user.id);
  }

  // ── Admin endpoints (protected by x-internal-key header) ─────────────────

  /** GET /api/orders/admin/all — list all orders */
  @Get('admin/all')
  async adminListOrders(
    @Headers('x-internal-key') key: string,
    @Query(new ZodPipe(ListOrdersQuerySchema)) query: ListOrdersQueryDto,
  ) {
    this.assertInternalKey(key);
    return this.orders.listAllOrders(query);
  }

  /** PATCH /api/orders/admin/:id/status — update order status */
  @Patch('admin/:id/status')
  @HttpCode(HttpStatus.OK)
  async adminUpdateStatus(
    @Headers('x-internal-key') key: string,
    @Param('id') id: string,
    @Body(new ZodPipe(UpdateOrderStatusSchema)) dto: UpdateOrderStatusDto,
  ) {
    this.assertInternalKey(key);
    return this.orders.updateStatus(id, dto);
  }

  private assertInternalKey(key: string) {
    const expected = this.config.get('INTERNAL_API_KEY', { infer: true });
    if (!key || key !== expected) throw new ForbiddenException('Invalid internal key');
  }
}
