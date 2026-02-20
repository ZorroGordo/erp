/**
 * Factpro API v2 — Electronic Invoicing for Peru (SUNAT)
 * API docs: https://docs.factpro.la/api-facturacion-v2
 *
 * Auth: Bearer token (from dashboard.factpro.la/token)
 * Demo base URL: https://dev.factpro.la/api/v2  (SUNAT beta)
 * Prod base URL:  https://api.factpro.la/api/v2
 */
import { config } from '../../config';

// ─── Type definitions ──────────────────────────────────────────────────────────

export type TipoDocumento = '01' | '03' | '07' | '08' | '09' | '12';

export interface FactproItem {
  unidad:              string;   // 'NIU' = unidad, 'ZZ' = servicio, 'KGM' = kg
  codigo?:             string;
  descripcion:         string;
  codigo_producto_sunat?: string;
  cantidad:            number;
  valor_unitario:      number;   // precio sin IGV
  precio_unitario:     number;   // precio con IGV (= valor_unitario * 1.18 for gravada)
  tipo_tax:            string;   // '10' = gravada, '20' = exonerada, '30' = inafecta
  total_base_tax:      number;   // base imponible
  total_tax:           number;   // monto IGV
  total:               number;   // total línea con IGV
}

export interface FactproCliente {
  cliente_tipo_documento: string; // '1'=DNI, '6'=RUC, '7'=Pasaporte, '4'=Carnet extranjería
  cliente_numero_documento: string;
  cliente_denominacion: string;
  cliente_direccion?:  string;
  cliente_email?:      string;
  cliente_telefono?:   string;
  codigo_pais?:        string;
  ubigeo?:             string;
}

export interface FactproTotales {
  total_exportacion:  number;
  total_gravadas:     number;
  total_inafectas:    number;
  total_exoneradas:   number;
  total_gratuitas:    number;
}

export interface FactproDocumentBody {
  tipo_documento:      TipoDocumento;  // '01' factura, '03' boleta, '07' nota crédito, '08' nota débito
  serie:               string;
  numero:              string | '#';   // '#' = auto-correlativo
  tipo_operacion:      string;         // '0101' = venta gravada al contado
  fecha_de_emision:    string;         // 'YYYY-MM-DD'
  hora_de_emision?:    string;         // 'HH:MM:SS'
  moneda:              string;         // 'PEN' | 'USD'
  fecha_de_vencimiento?: string;
  enviar_automaticamente_al_cliente?: boolean;
  forma_de_pago?:      string;
  numero_orden?:       string;
  codigo?:             string;
  datos_del_emisor: {
    codigo_establecimiento: string;    // '0000' = sede principal
  };
  cliente:             FactproCliente;
  items:               FactproItem[];
  totales:             FactproTotales;
  // For notas de crédito/débito:
  codigo_tipo_nota?:         string;   // '01'=devolución total, '02'=anulación, '03'=corrección
  motivo_o_sustento_de_nota?: string;
  documento_afectado?: {
    tipo_de_comprobante: TipoDocumento;
    serie:               string;
    numero:              string;
  };
}

export interface FactproResponse {
  success:           boolean;
  number?:           string;
  filename?:         string;
  external_id?:      string;
  hash?:             string;
  qr?:               string;
  state_type_id?:    string;
  state_description?: string;
  links?: {
    xml?:  string;
    pdf?:  string;
    cdr?:  string;
  };
  errors?:           string[];
  message?:          string;
}

// ─── Client ───────────────────────────────────────────────────────────────────

function getHeaders(): Record<string, string> {
  const token = config.FACTPRO_API_TOKEN;
  if (!token) throw Object.assign(new Error('FACTPRO_API_TOKEN not configured'), { statusCode: 503, code: 'FACTPRO_NOT_CONFIGURED' });
  return {
    'Content-Type':  'application/json',
    'Authorization': `Bearer ${token}`,
  };
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const url = `${config.FACTPRO_BASE_URL}${path}`;
  const res = await fetch(url, {
    method:  'POST',
    headers: getHeaders(),
    body:    JSON.stringify(body),
  });
  const json = await res.json() as T & { message?: string; errors?: string[] };
  if (!res.ok) {
    const msg = (json as any)?.message ?? (json as any)?.errors?.join('; ') ?? `HTTP ${res.status}`;
    throw Object.assign(new Error(`Factpro error: ${msg}`), {
      statusCode: res.status >= 500 ? 502 : 422,
      code: 'FACTPRO_ERROR',
      detail: json,
    });
  }
  return json;
}

// ─── Emit a comprobante ───────────────────────────────────────────────────────

export async function emitirDocumento(body: FactproDocumentBody): Promise<FactproResponse> {
  return post<FactproResponse>('/documentos', body);
}

// ─── Payload builders ─────────────────────────────────────────────────────────

/** Build a Factura (tipo 01) or Boleta (tipo 03) payload from ERP invoice data */
export function buildFacturaPayload(args: {
  tipoDocumento:  '01' | '03';
  serie:          string;
  entityDocType:  string;           // 'RUC' | 'DNI' | 'PASSPORT'
  entityDocNo:    string;
  entityName:     string;
  entityAddress?: string;
  entityEmail?:   string;
  issueDate:      Date;
  currency:       string;
  items: {
    descripcion:   string;
    codigo?:       string;
    cantidad:      number;
    valorUnitario: number;   // sin IGV
    igvRate:       number;   // e.g. 0.18
  }[];
  numeroOrden?: string;
}): FactproDocumentBody {
  const docTypeMap: Record<string, string> = { RUC: '6', DNI: '1', PASSPORT: '7', CE: '4' };
  const clienteTipoDoc = docTypeMap[args.entityDocType.toUpperCase()] ?? '6';

  const items: FactproItem[] = args.items.map(item => {
    const base      = Math.round(item.valorUnitario * item.cantidad * 100) / 100;
    const igvAmt    = Math.round(base * item.igvRate * 100) / 100;
    const total     = Math.round((base + igvAmt) * 100) / 100;
    const unitPrice = Math.round((item.valorUnitario * (1 + item.igvRate)) * 100) / 100;
    return {
      unidad:          'NIU',
      codigo:          item.codigo ?? '',
      descripcion:     item.descripcion,
      cantidad:        item.cantidad,
      valor_unitario:  item.valorUnitario,
      precio_unitario: unitPrice,
      tipo_tax:        item.igvRate > 0 ? '10' : '30',
      total_base_tax:  base,
      total_tax:       igvAmt,
      total,
    };
  });

  const totalGravadas = items.filter(i => i.tipo_tax === '10').reduce((s, i) => s + i.total_base_tax, 0);
  const totalInafectas = items.filter(i => i.tipo_tax === '30').reduce((s, i) => s + i.total, 0);
  const totalIGV      = items.reduce((s, i) => s + i.total_tax, 0);

  const isoDate = args.issueDate.toISOString().slice(0, 10);

  return {
    tipo_documento:   args.tipoDocumento,
    serie:            args.serie,
    numero:           '#',
    tipo_operacion:   '0101',
    fecha_de_emision: isoDate,
    moneda:           args.currency || 'PEN',
    enviar_automaticamente_al_cliente: !!args.entityEmail,
    numero_orden:     args.numeroOrden ?? '',
    datos_del_emisor: { codigo_establecimiento: '0000' },
    cliente: {
      cliente_tipo_documento:   clienteTipoDoc,
      cliente_numero_documento: args.entityDocNo,
      cliente_denominacion:     args.entityName,
      cliente_direccion:        args.entityAddress ?? '',
      cliente_email:            args.entityEmail   ?? '',
    },
    items,
    totales: {
      total_exportacion: 0,
      total_gravadas:    Math.round(totalGravadas  * 100) / 100,
      total_inafectas:   Math.round(totalInafectas * 100) / 100,
      total_exoneradas:  0,
      total_gratuitas:   0,
    },
  };
}

/** Build a Nota de Crédito (tipo 07) payload */
export function buildNotaCreditoPayload(args: {
  serieOriginal:  string;
  numeroOriginal: string;
  tipoOriginal:   '01' | '03';
  serieNota:      string;
  motivo:         string;           // reason text
  codigoTipoNota: string;           // '01' devolución total, '02' anulación, '03' corrección, '13' ajuste precio
  cliente:        FactproCliente;
  items:          FactproItem[];
  totales:        FactproTotales;
  issueDate:      Date;
  currency:       string;
}): FactproDocumentBody {
  return {
    tipo_documento:   '07',
    serie:            args.serieNota,
    numero:           '#',
    tipo_operacion:   '0101',
    fecha_de_emision: args.issueDate.toISOString().slice(0, 10),
    moneda:           args.currency || 'PEN',
    datos_del_emisor: { codigo_establecimiento: '0000' },
    cliente:          args.cliente,
    items:            args.items,
    totales:          args.totales,
    codigo_tipo_nota: args.codigoTipoNota,
    motivo_o_sustento_de_nota: args.motivo,
    documento_afectado: {
      tipo_de_comprobante: args.tipoOriginal,
      serie:               args.serieOriginal,
      numero:              args.numeroOriginal,
    },
  };
}
