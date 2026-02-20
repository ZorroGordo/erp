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
exports.CheckoutController = void 0;
const common_1 = require("@nestjs/common");
const checkout_service_1 = require("./checkout.service");
const zod_pipe_1 = require("../../common/pipes/zod.pipe");
const checkout_dto_1 = require("./checkout.dto");
function cartOpts(req) {
    const user = req.user;
    if (user)
        return { userId: user.id, userType: user.type };
    const guestToken = req.headers['x-guest-token'];
    if (guestToken)
        return { guestSessionId: guestToken, userType: 'GUEST' };
    return { userType: 'GUEST' };
}
let CheckoutController = class CheckoutController {
    checkout;
    constructor(checkout) {
        this.checkout = checkout;
    }
    async getSlots(query) {
        return this.checkout.getAvailableSlots(query.from, query.to);
    }
    async validate(req, dto) {
        return this.checkout.validateCart(cartOpts(req), dto.deliveryDate, dto.deliveryWindow);
    }
    async initiate(req, dto) {
        const opts = cartOpts(req);
        return this.checkout.initiateCheckout(opts, dto);
    }
    async direct(req, body) {
        const user = req.user;
        return this.checkout.createDirectOrder({ ...body, userId: user?.id });
    }
};
exports.CheckoutController = CheckoutController;
__decorate([
    (0, common_1.Get)('slots'),
    __param(0, (0, common_1.Query)(new zod_pipe_1.ZodPipe(checkout_dto_1.GetSlotsSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], CheckoutController.prototype, "getSlots", null);
__decorate([
    (0, common_1.Post)('validate'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)(new zod_pipe_1.ZodPipe(checkout_dto_1.ValidateCartSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], CheckoutController.prototype, "validate", null);
__decorate([
    (0, common_1.Post)('initiate'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)(new zod_pipe_1.ZodPipe(checkout_dto_1.InitiateCheckoutSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], CheckoutController.prototype, "initiate", null);
__decorate([
    (0, common_1.Post)('direct'),
    (0, common_1.HttpCode)(common_1.HttpStatus.CREATED),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], CheckoutController.prototype, "direct", null);
exports.CheckoutController = CheckoutController = __decorate([
    (0, common_1.Controller)('checkout'),
    __metadata("design:paramtypes", [checkout_service_1.CheckoutService])
], CheckoutController);
//# sourceMappingURL=checkout.controller.js.map