import {
  Controller, Get, Post, Param, UseGuards, Req, HttpCode, HttpStatus,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SubscriptionsService } from './subscriptions.service';

@Controller('subscriptions')
@UseGuards(AuthGuard('jwt'))
export class SubscriptionsController {
  constructor(private readonly subs: SubscriptionsService) {}

  /** GET /api/subscriptions */
  @Get()
  list(@Req() req: any) {
    return this.subs.listForUser(req.user.id);
  }

  /** POST /api/subscriptions/:id/pause */
  @Post(':id/pause')
  @HttpCode(HttpStatus.OK)
  pause(@Param('id') id: string, @Req() req: any) {
    return this.subs.pause(id, req.user.id);
  }

  /** POST /api/subscriptions/:id/cancel */
  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  cancel(@Param('id') id: string, @Req() req: any) {
    return this.subs.cancel(id, req.user.id);
  }
}
