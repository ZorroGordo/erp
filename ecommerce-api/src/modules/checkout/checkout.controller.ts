import {
  Controller, Get, Post, Body, Query, Req, HttpCode, HttpStatus,
} from '@nestjs/common';
import { CheckoutService } from './checkout.service';
import { ZodPipe } from '../../common/pipes/zod.pipe';
import {
  GetSlotsSchema, ValidateCartSchema, InitiateCheckoutSchema,
  type GetSlotsDto, type ValidateCartDto, type InitiateCheckoutDto,
} from './checkout.dto';
import type { CurrentUserPayload } from '../../common/decorators/current-user.decorator';

/** Resolves cart identity from request (mirrors cart.controller) */
function cartOpts(req: any): { userId?: string; guestSessionId?: string; userType?: 'B2C' | 'B2B' | 'GUEST' } {
  const user: CurrentUserPayload | undefined = req.user;
  if (user) return { userId: user.id, userType: user.type };
  const guestToken = req.headers['x-guest-token'] as string | undefined;
  if (guestToken) return { guestSessionId: guestToken, userType: 'GUEST' };
  return { userType: 'GUEST' };
}

@Controller('checkout')
export class CheckoutController {
  constructor(private readonly checkout: CheckoutService) {}

  /** GET /api/checkout/slots?from=YYYY-MM-DD&to=YYYY-MM-DD */
  @Get('slots')
  async getSlots(@Query(new ZodPipe(GetSlotsSchema)) query: GetSlotsDto) {
    return this.checkout.getAvailableSlots(query.from, query.to);
  }

  /** POST /api/checkout/validate — check cart + slot before showing payment UI */
  @Post('validate')
  @HttpCode(HttpStatus.OK)
  async validate(
    @Req() req: any,
    @Body(new ZodPipe(ValidateCartSchema)) dto: ValidateCartDto,
  ) {
    return this.checkout.validateCart(cartOpts(req), dto.deliveryDate, dto.deliveryWindow as any);
  }

  /** POST /api/checkout/initiate — create order + Culqi pre-order, returns culqiOrderId */
  @Post('initiate')
  async initiate(
    @Req() req: any,
    @Body(new ZodPipe(InitiateCheckoutSchema)) dto: InitiateCheckoutDto,
  ) {
    const opts = cartOpts(req);
    return this.checkout.initiateCheckout(opts, dto);
  }

  /** POST /api/checkout/direct — create order from inline items (Next.js frontend adapter) */
  @Post('direct')
  @HttpCode(HttpStatus.CREATED)
  async direct(@Req() req: any, @Body() body: any) {
    const user: CurrentUserPayload | undefined = req.user;
    return this.checkout.createDirectOrder({ ...body, userId: user?.id });
  }
}
