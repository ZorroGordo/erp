/**
 * Internal endpoints — called machine-to-machine by the ERP (or staff scripts).
 * Protected by INTERNAL_API_KEY header, never exposed to public clients.
 */
import {
  Controller, Post, Param, Headers, UnauthorizedException, HttpCode,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ErpAdapterService } from '../erp-adapter/erp-adapter.service';
import { QUEUES, JOBS } from '../../queue/queues';
import type { Env } from '../../config/configuration';

@Controller('internal')
export class InternalController {
  constructor(
    private readonly config:  ConfigService<Env>,
    private readonly erp:     ErpAdapterService,
    @InjectQueue(QUEUES.CATALOG_SYNC) private readonly catalogQueue: Queue,
  ) {}

  private guardKey(key: string | undefined): void {
    const expected = this.config.getOrThrow('INTERNAL_API_KEY');
    if (!key || key !== expected) throw new UnauthorizedException('Invalid internal API key');
  }

  /** POST /api/internal/cache/invalidate/catalog */
  @Post('cache/invalidate/catalog')
  @HttpCode(202)
  async invalidateCatalog(@Headers('x-internal-key') key: string) {
    this.guardKey(key);
    await this.catalogQueue.add(JOBS.CATALOG_SYNC.FULL_SYNC, {});
    return { queued: true, job: JOBS.CATALOG_SYNC.FULL_SYNC };
  }

  /** POST /api/internal/cache/invalidate/catalog/:productId */
  @Post('cache/invalidate/catalog/:productId')
  @HttpCode(202)
  async invalidateProduct(
    @Param('productId') productId: string,
    @Headers('x-internal-key') key: string,
  ) {
    this.guardKey(key);
    await this.catalogQueue.add(JOBS.CATALOG_SYNC.SYNC_PRODUCT, { productId });
    return { queued: true, job: JOBS.CATALOG_SYNC.SYNC_PRODUCT, productId };
  }

  /** POST /api/internal/cache/invalidate/prices/:erpCustomerId */
  @Post('cache/invalidate/prices/:erpCustomerId')
  @HttpCode(202)
  async invalidateB2BPrices(
    @Param('erpCustomerId') erpCustomerId: string,
    @Headers('x-internal-key') key: string,
  ) {
    this.guardKey(key);
    await this.erp.invalidateB2BPriceCache(erpCustomerId);
    return { invalidated: true, erpCustomerId };
  }
}
