import Decimal from 'decimal.js';
import type { ErpPriceAgreement } from '../erp-adapter/erp-adapter.types';
export interface PricedItem {
    erpProductId: string;
    sku: string;
    name: string;
    basePricePen: string;
    unitPrice: string;
    igvAmount: string;
    totalUnitPrice: string;
    discountPct: string;
    igvRate: string;
}
export declare class PricingService {
    computeUnitPrice(basePricePen: string, agreements: ErpPriceAgreement[], productId: string, hasSubscription?: boolean): {
        unitPrice: Decimal;
        igvAmount: Decimal;
        totalUnitPrice: Decimal;
        discountPct: Decimal;
    };
    priceProducts(products: Array<{
        id: string;
        sku: string;
        name: string;
        basePricePen: string;
    }>, agreements: ErpPriceAgreement[], hasSubscription?: boolean): PricedItem[];
}
