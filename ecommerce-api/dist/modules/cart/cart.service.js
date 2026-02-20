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
var CartService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.CartService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../database/prisma.service");
const catalog_service_1 = require("../catalog/catalog.service");
let CartService = CartService_1 = class CartService {
    prisma;
    catalog;
    logger = new common_1.Logger(CartService_1.name);
    constructor(prisma, catalog) {
        this.prisma = prisma;
        this.catalog = catalog;
    }
    async getOrCreateCartForUser(userId) {
        let cart = await this.prisma.cart.findUnique({
            where: { userId },
            include: { items: true },
        });
        if (!cart) {
            cart = await this.prisma.cart.create({
                data: { userId },
                include: { items: true },
            });
        }
        return cart;
    }
    async getOrCreateCartForGuest(guestSessionId) {
        let cart = await this.prisma.cart.findUnique({
            where: { guestSessionId },
            include: { items: true },
        });
        if (!cart) {
            cart = await this.prisma.cart.create({
                data: { guestSessionId },
                include: { items: true },
            });
        }
        return cart;
    }
    async getCart(opts) {
        const cart = opts.userId
            ? await this.getOrCreateCartForUser(opts.userId)
            : await this.getOrCreateCartForGuest(opts.guestSessionId);
        if (cart.items.length === 0) {
            return { cartId: cart.id, items: [], subtotalExIgv: '0.0000', igvTotal: '0.0000', total: '0.0000' };
        }
        const pricedItems = await Promise.all(cart.items.map(async (item) => {
            const product = await this.catalog.getProduct(item.erpProductId, {
                userId: opts.userId,
                userType: opts.userType ?? 'GUEST',
            }).catch(() => null);
            const unitPrice = product?.unitPrice ?? item.unitPrice.toString();
            const igvAmount = product?.igvAmount
                ?? (parseFloat(item.unitPrice.toString()) * parseFloat(item.igvRate.toString())).toFixed(4);
            const totalUnitPrice = product?.totalUnitPrice ?? (parseFloat(unitPrice) + parseFloat(igvAmount)).toFixed(4);
            return {
                id: item.id,
                erpProductId: item.erpProductId,
                sku: item.sku,
                name: item.name,
                qty: item.qty,
                unitPrice,
                igvAmount,
                totalUnitPrice,
                lineTotal: (parseFloat(totalUnitPrice) * item.qty).toFixed(4),
            };
        }));
        const subtotalExIgv = pricedItems.reduce((s, i) => s + parseFloat(i.unitPrice) * i.qty, 0).toFixed(4);
        const igvTotal = pricedItems.reduce((s, i) => s + parseFloat(i.igvAmount) * i.qty, 0).toFixed(4);
        const total = pricedItems.reduce((s, i) => s + parseFloat(i.lineTotal), 0).toFixed(4);
        return { cartId: cart.id, items: pricedItems, subtotalExIgv, igvTotal, total };
    }
    async addItem(cartOpts, dto) {
        const product = await this.catalog.getProduct(dto.erpProductId, {
            userId: cartOpts.userId,
            userType: cartOpts.userType ?? 'GUEST',
        });
        const cart = cartOpts.userId
            ? await this.getOrCreateCartForUser(cartOpts.userId)
            : await this.getOrCreateCartForGuest(cartOpts.guestSessionId);
        const existing = cart.items.find((i) => i.erpProductId === dto.erpProductId);
        if (existing) {
            await this.prisma.cartItem.update({
                where: { id: existing.id },
                data: {
                    qty: existing.qty + dto.qty,
                    unitPrice: parseFloat(product.unitPrice),
                    igvRate: parseFloat(product.igvRate),
                },
            });
        }
        else {
            await this.prisma.cartItem.create({
                data: {
                    cartId: cart.id,
                    erpProductId: dto.erpProductId,
                    sku: product.sku,
                    name: product.name,
                    qty: dto.qty,
                    unitPrice: parseFloat(product.unitPrice),
                    igvRate: parseFloat(product.igvRate),
                },
            });
        }
        return this.getCart(cartOpts);
    }
    async updateItem(cartOpts, erpProductId, dto) {
        const cart = cartOpts.userId
            ? await this.getOrCreateCartForUser(cartOpts.userId)
            : await this.getOrCreateCartForGuest(cartOpts.guestSessionId);
        const item = cart.items.find((i) => i.erpProductId === erpProductId);
        if (!item)
            throw new common_1.NotFoundException('Item not in cart');
        if (dto.qty === 0) {
            await this.prisma.cartItem.delete({ where: { id: item.id } });
        }
        else {
            await this.prisma.cartItem.update({ where: { id: item.id }, data: { qty: dto.qty } });
        }
        return this.getCart(cartOpts);
    }
    async removeItem(cartOpts, erpProductId) {
        return this.updateItem(cartOpts, erpProductId, { qty: 0 });
    }
    async clearCart(cartId) {
        await this.prisma.cartItem.deleteMany({ where: { cartId } });
    }
    async mergeGuestCart(userId, guestToken) {
        const guestSession = await this.prisma.guestSession.findUnique({
            where: { sessionToken: guestToken },
        });
        if (!guestSession)
            return;
        const guestCart = await this.prisma.cart.findUnique({
            where: { guestSessionId: guestSession.id },
            include: { items: true },
        });
        if (!guestCart || guestCart.items.length === 0)
            return;
        const userCart = await this.getOrCreateCartForUser(userId);
        for (const guestItem of guestCart.items) {
            const existing = await this.prisma.cartItem.findUnique({
                where: { cartId_erpProductId: { cartId: userCart.id, erpProductId: guestItem.erpProductId } },
            });
            if (existing) {
                await this.prisma.cartItem.update({
                    where: { id: existing.id },
                    data: { qty: existing.qty + guestItem.qty },
                });
            }
            else {
                await this.prisma.cartItem.create({
                    data: {
                        cartId: userCart.id,
                        erpProductId: guestItem.erpProductId,
                        sku: guestItem.sku,
                        name: guestItem.name,
                        qty: guestItem.qty,
                        unitPrice: guestItem.unitPrice,
                        igvRate: guestItem.igvRate,
                    },
                });
            }
        }
        await this.prisma.cart.delete({ where: { id: guestCart.id } });
        this.logger.log(`Merged guest cart ${guestCart.id} into user cart ${userCart.id}`);
    }
};
exports.CartService = CartService;
exports.CartService = CartService = CartService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        catalog_service_1.CatalogService])
], CartService);
//# sourceMappingURL=cart.service.js.map