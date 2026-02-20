export interface ErpProduct {
    id: string;
    sku: string;
    name: string;
    description: string | null;
    basePricePen: string;
    taxClass: string;
    unitOfSale: string;
    imageUrl: string | null;
    isB2cVisible: boolean;
    isB2bVisible: boolean;
    minOrderQty: string;
    category: {
        id: string;
        name: string;
    };
}
export interface ErpCategory {
    id: string;
    name: string;
}
export interface ErpPriceAgreement {
    id: string;
    customerId: string;
    productId: string;
    pricingType: 'FIXED_PRICE' | 'DISCOUNT_PCT';
    value: string;
    effectiveFrom: string;
    effectiveTo: string | null;
}
export interface ErpCustomer {
    id: string;
    name: string;
    type: 'B2B' | 'B2C';
    erpCode: string | null;
}
