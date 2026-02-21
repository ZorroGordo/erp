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

// ── Invoice ───────────────────────────────────────────────────────────────────

export interface NubefactPayload {
  operacion: string;
  tipo_de_comprobante: number;  // 1=Factura, 3=Boleta, 7=Nota Crédito
  serie: string;
  numero: number;
  sunat_transaction: number;
  cliente_tipo_de_documento: number;
  cliente_numero_de_documento: string;
  cliente_denominacion: string;
  cliente_direccion?: string;
  cliente_email?: string;
  fecha_de_emision: string;     // DD-MM-YYYY
  moneda: number;               // 1=PEN, 2=USD
  tipo_de_cambio?: number;
  porcentaje_de_igv: number;    // 18
  total_gravada: number;
  total_igv: number;
  total: number;
  items: NubefactItem[];
  // For credit notes
  tipo_de_nota_de_credito?: number;
  documento_que_se_modifica_tipo?: number;
  documento_que_se_modifica_serie?: string;
  documento_que_se_modifica_numero?: number;
}

export interface NubefactItem {
  unidad_de_medida: string;
  codigo: string;
  descripcion: string;
  cantidad: number;
  valor_unitario: number;
  precio_unitario: number;
  subtotal: number;
  tipo_de_igv: number;          // 1=Gravado, 2=Inafecto, 3=Exonerado
  igv: number;
  total: number;
  anticipo_regularizacion: boolean;
  anticipo_documento_serie?: string;
  anticipo_documento_numero?: number;
}

export interface NubefactCDR {
  aceptada_por_sunat: boolean;
  codigo_sunat?: string;
  mensaje_sunat?: string;
  enlace_del_cpe?: string;  // PDF URL
  enlace_del_xml?: string;
  codigo_hash?: string;
  qr?: string;
  nubefact_id?: string;
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
