import { Module } from '@nestjs/common';
import { ErpAdapterService } from './erp-adapter.service';
// RedisService available from global DatabaseModule

@Module({
  providers: [ErpAdapterService],
  exports:   [ErpAdapterService],
})
export class ErpAdapterModule {}
