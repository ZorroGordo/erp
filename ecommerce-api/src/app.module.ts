import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { configuration } from './config/configuration';
import type { Env } from './config/configuration';

// Global infrastructure (Prisma + Redis — singleton, available everywhere)
import { DatabaseModule } from './database/database.module';

// Feature modules
import { AuthModule }      from './modules/auth/auth.module';
import { ErpAdapterModule } from './modules/erp-adapter/erp-adapter.module';
import { CatalogModule }   from './modules/catalog/catalog.module';
import { CartModule }      from './modules/cart/cart.module';
import { CheckoutModule }  from './modules/checkout/checkout.module';
import { PaymentsModule }  from './modules/payments/payments.module';
import { OrdersModule }        from './modules/orders/orders.module';
import { SubscriptionsModule } from './modules/subscriptions/subscriptions.module';

// Internal controller (ops / machine-to-machine)
import { InternalController } from './modules/admin/internal.controller';

// Queue processors
import { CatalogSyncProcessor } from './queue/processors/catalog-sync.processor';
import { QUEUES } from './queue/queues';

@Module({
  imports: [
    // ── Config ────────────────────────────────────────────────────────────────
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),

    // ── Database + Redis (global singleton) ───────────────────────────────────
    DatabaseModule,

    // ── BullMQ ────────────────────────────────────────────────────────────────
    BullModule.forRootAsync({
      inject:     [ConfigService],
      useFactory: (config: ConfigService<Env>) => ({
        connection: { url: config.get('REDIS_URL') ?? 'redis://localhost:6379' },
      }),
    }),
    BullModule.registerQueue(
      { name: QUEUES.EMAIL },
      { name: QUEUES.INVOICE },
      { name: QUEUES.SUBSCRIPTION_BILLING },
      { name: QUEUES.CATALOG_SYNC },
    ),

    // ── Feature modules ───────────────────────────────────────────────────────
    AuthModule,
    ErpAdapterModule,
    CatalogModule,
    CartModule,
    CheckoutModule,
    PaymentsModule,
    OrdersModule,
    SubscriptionsModule,
  ],

  controllers: [InternalController],
  providers:   [CatalogSyncProcessor],
})
export class AppModule {}
