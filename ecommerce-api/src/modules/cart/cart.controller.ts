import {
  Controller, Get, Post, Patch, Delete, Body, Param,
  Req, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CartService } from './cart.service';
import { ZodPipe } from '../../common/pipes/zod.pipe';
import {
  AddToCartSchema, UpdateCartItemSchema, MergeCartSchema,
  type AddToCartDto, type UpdateCartItemDto, type MergeCartDto,
} from './cart.dto';
import type { CurrentUserPayload } from '../../common/decorators/current-user.decorator';

/** Resolves cart identity: auth user → userId, else guest → guestSessionId from header */
function cartOpts(req: any): { userId?: string; guestSessionId?: string; userType?: 'B2C' | 'B2B' | 'GUEST' } {
  const user: CurrentUserPayload | undefined = req.user;
  if (user) return { userId: user.id, userType: user.type };

  const guestToken = req.headers['x-guest-token'] as string | undefined;
  if (guestToken) {
    // We store guestSessionId after validating the token in a guard — use raw token for now
    // CartService will resolve via GuestSession.sessionToken
    return { guestSessionId: guestToken, userType: 'GUEST' };
  }
  return { userType: 'GUEST' };
}

@Controller('cart')
export class CartController {
  constructor(private readonly cart: CartService) {}

  /** GET /api/cart — view cart with live prices */
  @Get()
  async getCart(@Req() req: any) {
    const opts = cartOpts(req);
    if (!opts.userId && !opts.guestSessionId) {
      return { cartId: null, items: [], subtotalExIgv: '0.0000', igvTotal: '0.0000', total: '0.0000' };
    }
    return this.cart.getCart(opts);
  }

  /** POST /api/cart/items — add product to cart */
  @Post('items')
  async addItem(
    @Req() req: any,
    @Body(new ZodPipe(AddToCartSchema)) dto: AddToCartDto,
  ) {
    const opts = cartOpts(req);
    if (!opts.userId && !opts.guestSessionId) {
      // Auto-create guest session for anonymous users — for now return error
      throw new Error('Provide X-Guest-Token header or log in to add items');
    }
    return this.cart.addItem(opts, dto);
  }

  /** PATCH /api/cart/items/:erpProductId — change quantity */
  @Patch('items/:erpProductId')
  async updateItem(
    @Req() req: any,
    @Param('erpProductId') erpProductId: string,
    @Body(new ZodPipe(UpdateCartItemSchema)) dto: UpdateCartItemDto,
  ) {
    return this.cart.updateItem(cartOpts(req), erpProductId, dto);
  }

  /** DELETE /api/cart/items/:erpProductId — remove item */
  @Delete('items/:erpProductId')
  @HttpCode(HttpStatus.OK)
  async removeItem(@Req() req: any, @Param('erpProductId') erpProductId: string) {
    return this.cart.removeItem(cartOpts(req), erpProductId);
  }

  /**
   * POST /api/cart/merge — merge guest cart into logged-in user cart.
   * Must be called immediately after login with the guest token.
   */
  @Post('merge')
  @UseGuards(AuthGuard('jwt'))
  @HttpCode(HttpStatus.OK)
  async mergeCart(@Req() req: any, @Body(new ZodPipe(MergeCartSchema)) dto: MergeCartDto) {
    const user: CurrentUserPayload = req.user;
    await this.cart.mergeGuestCart(user.id, dto.guestToken);
    return this.cart.getCart({ userId: user.id, userType: user.type });
  }
}
