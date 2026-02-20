import { WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { ErpAdapterService } from '../../modules/erp-adapter/erp-adapter.service';
export declare class CatalogSyncProcessor extends WorkerHost {
    private readonly erp;
    private readonly logger;
    constructor(erp: ErpAdapterService);
    process(job: Job): Promise<void>;
    private handleFullSync;
    private handleSyncProduct;
    onFailed(job: Job, err: Error): void;
}
