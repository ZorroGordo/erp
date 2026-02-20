import { ErpAdapterService } from '../erp-adapter/erp-adapter.service';
import { PrismaService } from '../../database/prisma.service';
import { PricingService } from './pricing.service';
import type { PricedItem } from './pricing.service';
export interface ProductListItem extends PricedItem {
    category: {
        id: string;
        name: string;
    };
    imageUrl: string | null;
    unitOfSale: string;
    minOrderQty: string;
}
export interface CatalogResponse {
    products: ProductListItem[];
    userType: 'B2C' | 'B2B' | 'GUEST';
    hasSubscription: boolean;
}
export declare class CatalogService {
    private readonly erp;
    private readonly prisma;
    private readonly pricing;
    constructor(erp: ErpAdapterService, prisma: PrismaService, pricing: PricingService);
    getCatalog(opts: {
        userId?: string;
        userType?: 'B2C' | 'B2B' | 'GUEST';
        search?: string;
        categoryId?: string;
    }): Promise<CatalogResponse>;
    getProduct(productId: string, opts?: {
        userId?: string;
        userType?: 'B2C' | 'B2B' | 'GUEST';
    }): Promise<ProductListItem>;
    getCategories(): Promise<import("../erp-adapter/erp-adapter.types").ErpCategory[]>;
    private getUserPricingContext;
    private hasActiveSubscription;
}
