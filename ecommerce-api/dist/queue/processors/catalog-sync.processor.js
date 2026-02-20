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
var CatalogSyncProcessor_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.CatalogSyncProcessor = void 0;
const bullmq_1 = require("@nestjs/bullmq");
const common_1 = require("@nestjs/common");
const bullmq_2 = require("bullmq");
const queues_1 = require("../queues");
const erp_adapter_service_1 = require("../../modules/erp-adapter/erp-adapter.service");
let CatalogSyncProcessor = CatalogSyncProcessor_1 = class CatalogSyncProcessor extends bullmq_1.WorkerHost {
    erp;
    logger = new common_1.Logger(CatalogSyncProcessor_1.name);
    constructor(erp) {
        super();
        this.erp = erp;
    }
    async process(job) {
        switch (job.name) {
            case queues_1.JOBS.CATALOG_SYNC.FULL_SYNC:
                await this.handleFullSync();
                break;
            case queues_1.JOBS.CATALOG_SYNC.SYNC_PRODUCT:
                await this.handleSyncProduct(job.data);
                break;
            default:
                this.logger.warn(`Unknown job: ${job.name}`);
        }
    }
    async handleFullSync() {
        this.logger.log('Running full catalog sync…');
        await this.erp.invalidateProductCache();
        const products = await this.erp.getPublicProducts();
        this.logger.log(`Catalog sync complete — ${products.length} products cached`);
    }
    async handleSyncProduct({ productId }) {
        this.logger.log(`Syncing product ${productId}`);
        await this.erp.invalidateProductCache();
        await this.erp.getProductById(productId);
        this.logger.log(`Product ${productId} sync complete`);
    }
    onFailed(job, err) {
        this.logger.error(`Job ${job.id} (${job.name}) failed: ${err.message}`, err.stack);
    }
};
exports.CatalogSyncProcessor = CatalogSyncProcessor;
__decorate([
    (0, bullmq_1.OnWorkerEvent)('failed'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [bullmq_2.Job, Error]),
    __metadata("design:returntype", void 0)
], CatalogSyncProcessor.prototype, "onFailed", null);
exports.CatalogSyncProcessor = CatalogSyncProcessor = CatalogSyncProcessor_1 = __decorate([
    (0, bullmq_1.Processor)(queues_1.QUEUES.CATALOG_SYNC),
    __metadata("design:paramtypes", [erp_adapter_service_1.ErpAdapterService])
], CatalogSyncProcessor);
//# sourceMappingURL=catalog-sync.processor.js.map