import type { UserRole } from '@prisma/client';

// ── API Response Wrapper ──────────────────────────────────────────────────────

export interface ApiResponse<T = unknown> {
  data: T;
  meta?: PaginationMeta;
}

export interface ApiError {
  error: string;
  message: string;
  details?: unknown;
}

export interface PaginationMeta {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface PaginationQuery {
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

// ── Auth Types ────────────────────────────────────────────────────────────────

export interface TokenPair {
  accessToken: string;
  expiresIn: number;  // seconds
}

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  roles: UserRole[];
}

// ── Pricing ───────────────────────────────────────────────────────────────────

export interface PricedOrderLine {
  productId: string;
  sku: string;
  name: string;
  qty: number;
  unitPrice: number;
  lineTotalExclIgv: number;
  igvAmount: number;
  lineTotal: number;
  pricingSource: 'PRICE_AGREEMENT' | 'STANDARD_LIST' | 'PROMO_CODE';
}

export interface PricePreview {
  lines: PricedOrderLine[];
  subtotalPen: number;
  igvPen: number;
  totalPen: number;
}

// ── Accounting ────────────────────────────────────────────────────────────────

export interface JournalEntryInput {
  entryDate: Date;
  description: string;
  sourceModule: string;
  sourceDocId?: string;
  lines: {
    accountCode: string;
    debit?: number;
    credit?: number;
    description?: string;
    costCenterCode?: string;
  }[];
}

// ── Inventory ────────────────────────────────────────────────────────────────

export interface WACUpdateInput {
  ingredientId: string;
  warehouseId: string;
  qtyAdded: number;
  unitCost: number;
}

// ── Payroll ───────────────────────────────────────────────────────────────────

export interface PayrollCalculation {
  employeeId: string;
  grossSalary: number;
  additions: {
    overtime25:  number;
    overtime35:  number;
    holidayPay:  number;  // 100% surcharge for holiday work
    bonuses:     number;
  };
  deductions: {
    afpOrOnp:        number;
    afpCommission:   number;
    afpInsurance:    number;
    igv5taCategoria: number;
    irRxH:           number;  // 8% IR retention for RxH contracts
    otherDeductions: number;
  };
  employerContributions: {
    essalud: number;
    sctr:    number;
  };
  provisions: {
    cts:           number;
    vacaciones:    number;
    gratificacion: number;
  };
  netSalary: number;
  employerTotalCost: number;
}
