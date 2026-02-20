import {
  Injectable, NotFoundException, BadRequestException, Logger,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CatalogService } from '../catalog/catalog.service';
import type { AddToCartDto, UpdateCartItemDto } from './cart.dto';

@Injectable()
export class CartService {
  private readonly logger = new Logger(CartService.name);

  constructor(
    private readonly prisma:   PrismaService,
    private readonly catalog:  CatalogService,
  ) {}

  // ─── Get or create cart ───────────────────────────────────────────────────

  async getOrCreateCartForUser(userId: string) {
    let cart = await this.prisma.cart.findUnique({
      where:   { userId },
      include: { items: true },
    });
    if (!cart) {
      cart = await this.prisma.cart.create({
        data:    { userId },
        include: { items: true },
      });
    }
    return cart;
  }

  async getOrCreateCartForGuest(guestSessionId: string) {
    let cart = await this.prisma.cart.findUnique({
      where:   { guestSessionId },
      include: { items: true },
    });
    if (!cart) {
      cart = await this.prisma.cart.create({
        data:    { guestSessionId },
        include: { items: true },
      });
    }
    return cart;
  }

  // ─── Get cart with live prices ────────────────────────────────────────────

  async getCart(opts: { userId?: string; guestSessionId?: string; userType?: 'B2C' | 'B2B' | 'GUEST' }) {
    const cart = opts.userId
      ? await this.getOrCreateCartForUser(opts.userId)
      : await this.getOrCreateCartForGuest(opts.guestSessionId!);

    if (cart.items.length === 0) {
      return { cartId: cart.id, items: [], subtotalExIgv: '0.0000', igvTotal: '0.0000', total: '0.0000' };
    }

    // Re-price each item live (prices may change between sessions)
    const pricedItems = await Promise.all(
      cart.items.map(async (item) => {
        const product = await this.catalog.getProduct(item.erpProductId, {
          userId:   opts.userId,
          userType: opts.userType ?? 'GUEST',
        }).catch(() => null);

        const unitPrice      = product?.unitPrice      ?? item.unitPrice.toString();
        // CartItem stores igvRate, not igvAmount — compute on the fly
        const igvAmount      = product?.igvAmount
          ?? (parseFloat(item.unitPrice.toString()) * parseFloat(item.igvRate.toString())).toFixed(4);
        const totalUnitPrice = product?.totalUnitPrice  ?? (parseFloat(unitPrice) + parseFloat(igvAmount)).toFixed(4);

        return {
          id:             item.id,
          erpProductId:   item.erpProductId,
          sku:            item.sku,
          name:           item.name,
          qty:            item.qty,
          unitPrice,
          igvAmount,
          totalUnitPrice,
          lineTotal:      (parseFloat(totalUnitPrice) * item.qty).toFixed(4),
        };
      }),
    );

    const subtotalExIgv = pricedItems.reduce((s, i) => s + parseFloat(i.unitPrice) * i.qty, 0).toFixed(4);
    const igvTotal      = pricedItems.reduce((s, i) => s + parseFloat(i.igvAmount) * i.qty, 0).toFixed(4);
    const total         = pricedItems.reduce((s, i) => s + parseFloat(i.lineTotal), 0).toFixed(4);

    return { cartId: cart.id, items: pricedItems, subtotalExIgv, igvTotal, total };
  }

  // ─── Add item ─────────────────────────────────────────────────────────────

  async addItem(
    cartOpts: { userId?: string; guestSessionId?: string; userType?: 'B2C' | 'B2B' | 'GUEST' },
    dto: AddToCartDto,
  ) {
    // Validate product exists and get current price
    const product = await this.catalog.getProduct(dto.erpProductId, {
      userId:   cartOpts.userId,
      userType: cartOpts.userType ?? 'GUEST',
    });

    const cart = cartOpts.userId
      ? await this.getOrCreateCartForUser(cartOpts.userId)
      : await this.getOrCreateCartForGuest(cartOpts.guestSessionId!);

    // Upsert: if product already in cart, increase qty
    const existing = cart.items.find((i) => i.erpProductId === dto.erpProductId);

    if (existing) {
      await this.prisma.cartItem.update({
        where: { id: existing.id },
        data:  {
          qty:       existing.qty + dto.qty,
          unitPrice: parseFloat(product.unitPrice),
          igvRate:   parseFloat(product.igvRate),
        },
      });
    } else {
      await this.prisma.cartItem.create({
        data: {
          cartId:       cart.id,
          erpProductId: dto.erpProductId,
          sku:          product.sku,
          name:         product.name,
          qty:          dto.qty,
          unitPrice:    parseFloat(product.unitPrice),
          igvRate:      parseFloat(product.igvRate),
        },
      });
    }

    return this.getCart(cartOpts);
  }

  // ─── Update item qty (qty=0 removes) ─────────────────────────────────────

  async updateItem(
    cartOpts: { userId?: string; guestSessionId?: string; userType?: 'B2C' | 'B2B' | 'GUEST' },
    erpProductId: string,
    dto: UpdateCartItemDto,
  ) {
    const cart = cartOpts.userId
      ? await this.getOrCreateCartForUser(cartOpts.userId)
      : await this.getOrCreateCartForGuest(cartOpts.guestSessionId!);

    const item = cart.items.find((i) => i.erpProductId === erpProductId);
    if (!item) throw new NotFoundException('Item not in cart');

    if (dto.qty === 0) {
      await this.prisma.cartItem.delete({ where: { id: item.id } });
    } else {
      await this.prisma.cartItem.update({ where: { id: item.id }, data: { qty: dto.qty } });
    }

    return this.getCart(cartOpts);
  }

  // ─── Remove item ──────────────────────────────────────────────────────────

  async removeItem(cartOpts: { userId?: string; guestSessionId?: string }, erpProductId: string) {
    return this.updateItem(cartOpts, erpProductId, { qty: 0 });
  }

  // ─── Clear cart ───────────────────────────────────────────────────────────

  async clearCart(cartId: string) {
    await this.prisma.cartItem.deleteMany({ where: { cartId } });
  }

  // ─── Merge guest cart into user cart (called after login) ─────────────────

  async mergeGuestCart(userId: string, guestToken: string): Promise<void> {
    const guestSession = await this.prisma.guestSession.findUnique({
      where: { sessionToken: guestToken },
    });
    if (!guestSession) return;  // guest session expired or invalid — no-op

    const guestCart = await this.prisma.cart.findUnique({
      where:   { guestSessionId: guestSession.id },
      include: { items: true },
    });
    if (!guestCart || guestCart.items.length === 0) return;

    const userCart = await this.getOrCreateCartForUser(userId);

    // Merge: for each guest item, upsert into user cart
    for (const guestItem of guestCart.items) {
      const existing = await this.prisma.cartItem.findUnique({
        where: { cartId_erpProductId: { cartId: userCart.id, erpProductId: guestItem.erpProductId } },
      });

      if (existing) {
        // Add quantities (guest takes precedence for price)
        await this.prisma.cartItem.update({
          where: { id: existing.id },
          data:  { qty: existing.qty + guestItem.qty },
        });
      } else {
        await this.prisma.cartItem.create({
          data: {
            cartId:       userCart.id,
            erpProductId: guestItem.erpProductId,
            sku:          guestItem.sku,
            name:         guestItem.name,
            qty:          guestItem.qty,
            unitPrice:    guestItem.unitPrice,
            igvRate:      guestItem.igvRate,
          },
        });
      }
    }

    // Delete guest cart after merging
    await this.prisma.cart.delete({ where: { id: guestCart.id } });
    this.logger.log(`Merged guest cart ${guestCart.id} into user cart ${userCart.id}`);
  }
}
