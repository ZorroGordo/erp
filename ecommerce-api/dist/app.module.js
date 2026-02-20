"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const bullmq_1 = require("@nestjs/bullmq");
const configuration_1 = require("./config/configuration");
const database_module_1 = require("./database/database.module");
const auth_module_1 = require("./modules/auth/auth.module");
const erp_adapter_module_1 = require("./modules/erp-adapter/erp-adapter.module");
const catalog_module_1 = require("./modules/catalog/catalog.module");
const cart_module_1 = require("./modules/cart/cart.module");
const checkout_module_1 = require("./modules/checkout/checkout.module");
const payments_module_1 = require("./modules/payments/payments.module");
const orders_module_1 = require("./modules/orders/orders.module");
const subscriptions_module_1 = require("./modules/subscriptions/subscriptions.module");
const internal_controller_1 = require("./modules/admin/internal.controller");
const catalog_sync_processor_1 = require("./queue/processors/catalog-sync.processor");
const queues_1 = require("./queue/queues");
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            config_1.ConfigModule.forRoot({ isGlobal: true, load: [configuration_1.configuration] }),
            database_module_1.DatabaseModule,
            bullmq_1.BullModule.forRootAsync({
                inject: [config_1.ConfigService],
                useFactory: (config) => ({
                    connection: { url: config.get('REDIS_URL') ?? 'redis://localhost:6379' },
                }),
            }),
            bullmq_1.BullModule.registerQueue({ name: queues_1.QUEUES.EMAIL }, { name: queues_1.QUEUES.INVOICE }, { name: queues_1.QUEUES.SUBSCRIPTION_BILLING }, { name: queues_1.QUEUES.CATALOG_SYNC }),
            auth_module_1.AuthModule,
            erp_adapter_module_1.ErpAdapterModule,
            catalog_module_1.CatalogModule,
            cart_module_1.CartModule,
            checkout_module_1.CheckoutModule,
            payments_module_1.PaymentsModule,
            orders_module_1.OrdersModule,
            subscriptions_module_1.SubscriptionsModule,
        ],
        controllers: [internal_controller_1.InternalController],
        providers: [catalog_sync_processor_1.CatalogSyncProcessor],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map