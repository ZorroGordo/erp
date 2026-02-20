// Shapes returned by the ERP API — mirrored here so the ecommerce-api
// never imports from the ERP project directly.

export interface ErpProduct {
  id:          string;
  sku:         string;
  name:        string;
  description: string | null;
  basePricePen: string;       // Decimal serialised as string by Prisma
  taxClass:    string;        // 'TAXABLE_IGV18' | 'EXEMPT'
  unitOfSale:  string;
  imageUrl:    string | null;
  isB2cVisible: boolean;
  isB2bVisible: boolean;
  minOrderQty: string;
  category: {
    id:   string;
    name: string;
  };
}

export interface ErpCategory {
  id:   string;
  name: string;
}

export interface ErpPriceAgreement {
  id:           string;
  customerId:   string;
  productId:    string;
  pricingType:  'FIXED_PRICE' | 'DISCOUNT_PCT';
  value:        string;           // Decimal as string
  effectiveFrom: string;
  effectiveTo:  string | null;
}

export interface ErpCustomer {
  id:          string;
  name:        string;
  type:        'B2B' | 'B2C';
  erpCode:     string | null;
}
