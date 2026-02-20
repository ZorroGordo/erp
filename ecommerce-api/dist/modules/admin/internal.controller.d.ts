import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { ErpAdapterService } from '../erp-adapter/erp-adapter.service';
import type { Env } from '../../config/configuration';
export declare class InternalController {
    private readonly config;
    private readonly erp;
    private readonly catalogQueue;
    constructor(config: ConfigService<Env>, erp: ErpAdapterService, catalogQueue: Queue);
    private guardKey;
    invalidateCatalog(key: string): Promise<{
        queued: boolean;
        job: "full-sync";
    }>;
    invalidateProduct(productId: string, key: string): Promise<{
        queued: boolean;
        job: "sync-product";
        productId: string;
    }>;
    invalidateB2BPrices(erpCustomerId: string, key: string): Promise<{
        invalidated: boolean;
        erpCustomerId: string;
    }>;
}
