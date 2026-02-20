import { Module } from '@nestjs/common';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';
import { PricingService } from './pricing.service';
import { ErpAdapterModule } from '../erp-adapter/erp-adapter.module';
// PrismaService available from global DatabaseModule

@Module({
  imports:     [ErpAdapterModule],
  controllers: [CatalogController],
  providers:   [CatalogService, PricingService],
  exports:     [CatalogService, PricingService],
})
export class CatalogModule {}
