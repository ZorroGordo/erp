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
exports.OrdersController = void 0;
const common_1 = require("@nestjs/common");
const passport_1 = require("@nestjs/passport");
const config_1 = require("@nestjs/config");
const orders_service_1 = require("./orders.service");
const zod_pipe_1 = require("../../common/pipes/zod.pipe");
const orders_dto_1 = require("./orders.dto");
let OrdersController = class OrdersController {
    orders;
    config;
    constructor(orders, config) {
        this.orders = orders;
        this.config = config;
    }
    async listMyOrders(req, query) {
        const user = req.user;
        return this.orders.listOrders(user.id, query);
    }
    async getOrder(req, id) {
        const user = req.user;
        return this.orders.getOrder(id, user.id);
    }
    async getStatusHistory(req, id) {
        const user = req.user;
        return this.orders.getStatusHistory(id, user.id);
    }
    async adminListOrders(key, query) {
        this.assertInternalKey(key);
        return this.orders.listAllOrders(query);
    }
    async adminUpdateStatus(key, id, dto) {
        this.assertInternalKey(key);
        return this.orders.updateStatus(id, dto);
    }
    assertInternalKey(key) {
        const expected = this.config.get('INTERNAL_API_KEY', { infer: true });
        if (!key || key !== expected)
            throw new common_1.ForbiddenException('Invalid internal key');
    }
};
exports.OrdersController = OrdersController;
__decorate([
    (0, common_1.Get)(),
    (0, common_1.UseGuards)((0, passport_1.AuthGuard)('jwt')),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Query)(new zod_pipe_1.ZodPipe(orders_dto_1.ListOrdersQuerySchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], OrdersController.prototype, "listMyOrders", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, common_1.UseGuards)((0, passport_1.AuthGuard)('jwt')),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], OrdersController.prototype, "getOrder", null);
__decorate([
    (0, common_1.Get)(':id/status-history'),
    (0, common_1.UseGuards)((0, passport_1.AuthGuard)('jwt')),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], OrdersController.prototype, "getStatusHistory", null);
__decorate([
    (0, common_1.Get)('admin/all'),
    __param(0, (0, common_1.Headers)('x-internal-key')),
    __param(1, (0, common_1.Query)(new zod_pipe_1.ZodPipe(orders_dto_1.ListOrdersQuerySchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], OrdersController.prototype, "adminListOrders", null);
__decorate([
    (0, common_1.Patch)('admin/:id/status'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __param(0, (0, common_1.Headers)('x-internal-key')),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)(new zod_pipe_1.ZodPipe(orders_dto_1.UpdateOrderStatusSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", Promise)
], OrdersController.prototype, "adminUpdateStatus", null);
exports.OrdersController = OrdersController = __decorate([
    (0, common_1.Controller)('orders'),
    __metadata("design:paramtypes", [orders_service_1.OrdersService,
        config_1.ConfigService])
], OrdersController);
//# sourceMappingURL=orders.controller.js.map