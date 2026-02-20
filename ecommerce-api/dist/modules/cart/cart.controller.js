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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CartController = void 0;
const common_1 = require("@nestjs/common");
const passport_1 = require("@nestjs/passport");
const cart_service_1 = require("./cart.service");
const zod_pipe_1 = require("../../common/pipes/zod.pipe");
const cart_dto_1 = require("./cart.dto");
function cartOpts(req) {
    const user = req.user;
    if (user)
        return { userId: user.id, userType: user.type };
    const guestToken = req.headers['x-guest-token'];
    if (guestToken) {
        return { guestSessionId: guestToken, userType: 'GUEST' };
    }
    return { userType: 'GUEST' };
}
let CartController = class CartController {
    cart;
    constructor(cart) {
        this.cart = cart;
    }
    async getCart(req) {
        const opts = cartOpts(req);
        if (!opts.userId && !opts.guestSessionId) {
            return { cartId: null, items: [], subtotalExIgv: '0.0000', igvTotal: '0.0000', total: '0.0000' };
        }
        return this.cart.getCart(opts);
    }
    async addItem(req, dto) {
        const opts = cartOpts(req);
        if (!opts.userId && !opts.guestSessionId) {
            throw new Error('Provide X-Guest-Token header or log in to add items');
        }
        return this.cart.addItem(opts, dto);
    }
    async updateItem(req, erpProductId, dto) {
        return this.cart.updateItem(cartOpts(req), erpProductId, dto);
    }
    async removeItem(req, erpProductId) {
        return this.cart.removeItem(cartOpts(req), erpProductId);
    }
    async mergeCart(req, dto) {
        const user = req.user;
        await this.cart.mergeGuestCart(user.id, dto.guestToken);
        return this.cart.getCart({ userId: user.id, userType: user.type });
    }
};
exports.CartController = CartController;
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], CartController.prototype, "getCart", null);
__decorate([
    (0, common_1.Post)('items'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)(new zod_pipe_1.ZodPipe(cart_dto_1.AddToCartSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], CartController.prototype, "addItem", null);
__decorate([
    (0, common_1.Patch)('items/:erpProductId'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('erpProductId')),
    __param(2, (0, common_1.Body)(new zod_pipe_1.ZodPipe(cart_dto_1.UpdateCartItemSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", Promise)
], CartController.prototype, "updateItem", null);
__decorate([
    (0, common_1.Delete)('items/:erpProductId'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('erpProductId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], CartController.prototype, "removeItem", null);
__decorate([
    (0, common_1.Post)('merge'),
    (0, common_1.UseGuards)((0, passport_1.AuthGuard)('jwt')),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)(new zod_pipe_1.ZodPipe(cart_dto_1.MergeCartSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], CartController.prototype, "mergeCart", null);
exports.CartController = CartController = __decorate([
    (0, common_1.Controller)('cart'),
    __metadata("design:paramtypes", [cart_service_1.CartService])
], CartController);
//# sourceMappingURL=cart.controller.js.map