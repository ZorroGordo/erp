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
exports.InternalController = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const bullmq_1 = require("@nestjs/bullmq");
const bullmq_2 = require("bullmq");
const erp_adapter_service_1 = require("../erp-adapter/erp-adapter.service");
const queues_1 = require("../../queue/queues");
let InternalController = class InternalController {
    config;
    erp;
    catalogQueue;
    constructor(config, erp, catalogQueue) {
        this.config = config;
        this.erp = erp;
        this.catalogQueue = catalogQueue;
    }
    guardKey(key) {
        const expected = this.config.getOrThrow('INTERNAL_API_KEY');
        if (!key || key !== expected)
            throw new common_1.UnauthorizedException('Invalid internal API key');
    }
    async invalidateCatalog(key) {
        this.guardKey(key);
        await this.catalogQueue.add(queues_1.JOBS.CATALOG_SYNC.FULL_SYNC, {});
        return { queued: true, job: queues_1.JOBS.CATALOG_SYNC.FULL_SYNC };
    }
    async invalidateProduct(productId, key) {
        this.guardKey(key);
        await this.catalogQueue.add(queues_1.JOBS.CATALOG_SYNC.SYNC_PRODUCT, { productId });
        return { queued: true, job: queues_1.JOBS.CATALOG_SYNC.SYNC_PRODUCT, productId };
    }
    async invalidateB2BPrices(erpCustomerId, key) {
        this.guardKey(key);
        await this.erp.invalidateB2BPriceCache(erpCustomerId);
        return { invalidated: true, erpCustomerId };
    }
};
exports.InternalController = InternalController;
__decorate([
    (0, common_1.Post)('cache/invalidate/catalog'),
    (0, common_1.HttpCode)(202),
    __param(0, (0, common_1.Headers)('x-internal-key')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], InternalController.prototype, "invalidateCatalog", null);
__decorate([
    (0, common_1.Post)('cache/invalidate/catalog/:productId'),
    (0, common_1.HttpCode)(202),
    __param(0, (0, common_1.Param)('productId')),
    __param(1, (0, common_1.Headers)('x-internal-key')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], InternalController.prototype, "invalidateProduct", null);
__decorate([
    (0, common_1.Post)('cache/invalidate/prices/:erpCustomerId'),
    (0, common_1.HttpCode)(202),
    __param(0, (0, common_1.Param)('erpCustomerId')),
    __param(1, (0, common_1.Headers)('x-internal-key')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], InternalController.prototype, "invalidateB2BPrices", null);
exports.InternalController = InternalController = __decorate([
    (0, common_1.Controller)('internal'),
    __param(2, (0, bullmq_1.InjectQueue)(queues_1.QUEUES.CATALOG_SYNC)),
    __metadata("design:paramtypes", [config_1.ConfigService,
        erp_adapter_service_1.ErpAdapterService,
        bullmq_2.Queue])
], InternalController);
//# sourceMappingURL=internal.controller.js.map