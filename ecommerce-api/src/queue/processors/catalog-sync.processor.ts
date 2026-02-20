import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QUEUES, JOBS } from '../queues';
import { ErpAdapterService } from '../../modules/erp-adapter/erp-adapter.service';

interface SyncProductJob { productId: string }

@Processor(QUEUES.CATALOG_SYNC)
export class CatalogSyncProcessor extends WorkerHost {
  private readonly logger = new Logger(CatalogSyncProcessor.name);

  constructor(private readonly erp: ErpAdapterService) {
    super();
  }

  async process(job: Job): Promise<void> {
    switch (job.name) {
      case JOBS.CATALOG_SYNC.FULL_SYNC:
        await this.handleFullSync();
        break;
      case JOBS.CATALOG_SYNC.SYNC_PRODUCT:
        await this.handleSyncProduct(job.data as SyncProductJob);
        break;
      default:
        this.logger.warn(`Unknown job: ${job.name}`);
    }
  }

  /** Triggered on demand or by ERP webhook to refresh entire product cache */
  private async handleFullSync(): Promise<void> {
    this.logger.log('Running full catalog sync…');
    await this.erp.invalidateProductCache();
    // Re-warm the cache immediately after invalidation
    const products = await this.erp.getPublicProducts();
    this.logger.log(`Catalog sync complete — ${products.length} products cached`);
  }

  /** Targeted invalidation + re-warm for a single product */
  private async handleSyncProduct({ productId }: SyncProductJob): Promise<void> {
    this.logger.log(`Syncing product ${productId}`);
    // Invalidating the full list is safest — single-product cache is derived from it
    await this.erp.invalidateProductCache();
    await this.erp.getProductById(productId);
    this.logger.log(`Product ${productId} sync complete`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, err: Error) {
    this.logger.error(`Job ${job.id} (${job.name}) failed: ${err.message}`, err.stack);
  }
}
