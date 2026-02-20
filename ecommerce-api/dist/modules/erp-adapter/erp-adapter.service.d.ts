import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../database/redis.service';
import type { Env } from '../../config/configuration';
import type { ErpProduct, ErpCategory, ErpPriceAgreement } from './erp-adapter.types';
export declare class ErpAdapterService {
    private readonly config;
    private readonly redis;
    private readonly logger;
    private baseUrl;
    constructor(config: ConfigService<Env>, redis: RedisService);
    getPublicProducts(): Promise<ErpProduct[]>;
    getProductById(id: string): Promise<ErpProduct | null>;
    getAllProducts(): Promise<ErpProduct[]>;
    getCategories(): Promise<ErpCategory[]>;
    getCustomerPriceAgreements(erpCustomerId: string): Promise<ErpPriceAgreement[]>;
    invalidateProductCache(): Promise<void>;
    invalidateB2BPriceCache(erpCustomerId: string): Promise<void>;
    private getServiceToken;
    private erpFetch;
}
