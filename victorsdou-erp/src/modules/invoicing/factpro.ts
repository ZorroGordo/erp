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

// ─── Guía de Remisión Electrónica Remitente (GRE) — API v3 ────────────────────
// Docs: https://docs.factpro.la/api-facturacion-v3/estructura-para-generar-guias-remitente
// POST {v3}/guias · tipo_documento "11". Requiere activar GRE en Factpro
// (Integración → Guías: usuario/clave SOL + ID/clave de la API de SUNAT).

export interface FactproGuiaBody {
  tipo_documento:          '11';
  serie:                   string;
  numero:                  string;
  fecha_de_traslado:       string;          // YYYY-MM-DD
  codigo_modo_transporte:  '01' | '02';     // 01 público · 02 privado
  motivo_traslado:         string;          // catálogo 20
  descripcion_motivo_traslado: string;
  peso_bruto_unidad:       'KGM' | 'TNE';
  peso_bruto_total:        string;
  numero_de_bultos:        string;
  observaciones:           string;
  formato_pdf:             'a4';
  cliente: {
    cliente_tipo_documento:   string;       // 4 RUC · 2 DNI · 3 CE · 5 pasaporte · 1 no domiciliado
    cliente_numero_documento: string;
    cliente_denominacion:     string;
    cliente_direccion:        string;
    codigo_pais:              string;
    ubigeo:                   string;
    cliente_email:            string;
    cliente_telefono:         string;
  };
  transportista: {
    transportista_numero_documento: string;
    transportista_denominacion:     string;
    numero_registro_mtc:            string;
  };
  conductor: {
    conductor_tipo_documento:      string;
    conductor_numero_documento:    string;
    conductor_nombres_y_apellidos: string;
    conductor_numero_licencia:     string;
    conductor_numero_de_placa:     string;
  };
  direccion_partida: { ubigeo: string; direccion: string };
  direccion_llegada: { ubigeo: string; direccion: string };
  items: { codigo: string; cantidad: string; descripcion: string; unidad: string }[];
}

export interface FactproV3Response {
  exito?:   boolean;
  mensaje?: string | null;
  data?: {
    numero?: string; archivo?: string; hash?: string; qr?: string;
    tipo_estado?: string; descripcion_estado?: string;
  };
  archivos?: { pdf?: string; xml?: string; cdr?: string };
  eventos?:  { date?: string; description?: string }[];
  errors?:   unknown;
}

const MOTIVO_CODE: Record<string, string> = { VENTA: '01', COMPRA: '02', TRASLADO: '04', DEVOLUCION: '06', OTROS: '13' };

/** Base v3. En v3 hay un solo host: demo/producción lo decide el entorno de la
 *  empresa en Factpro (PUT /empresas/entorno), no la URL. */
export function factproV3Base(): string {
  return (process.env.FACTPRO_V3_BASE_URL ?? process.env.FACTPRO_GRE_BASE_URL ?? 'https://api.factpro.la/api/v3').replace(/\/$/, '');
}

export function buildGuiaPayload(g: {
  series: string; correlative: string; entityDocNo: string; entityName: string; entityEmail?: string | null;
  guiaMovementType?: string | null; guiaStartDate?: Date | null; issueDate: Date;
  guiaTransportMode?: string | null; guiaGrossWeight?: unknown; guiaWeightUnit?: string | null; guiaPackages?: number | null;
  guiaSenderAddress?: string | null; guiaOriginUbigeo?: string | null;
  guiaRecipientAddress?: string | null; guiaDestUbigeo?: string | null;
  guiaTransportistRuc?: string | null; guiaTransportistName?: string | null; guiaTransportistPlate?: string | null;
  guiaTransportistLicense?: string | null; guiaDriverDocNo?: string | null; guiaDriverName?: string | null;
  guiaGoodsDescription?: string | null;
  lines: { description: string; qty: unknown; unitCode?: string | null; productId?: string | null }[];
}): FactproGuiaBody {
  const lima = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
  const doc = (g.entityDocNo ?? '').trim();
  const clienteTipo = /^\d{11}$/.test(doc) ? '4' : /^\d{8}$/.test(doc) ? '2' : '3';
  const mode = g.guiaTransportMode === '02' ? '02' : '01';
  const motivo = MOTIVO_CODE[g.guiaMovementType ?? 'VENTA'] ?? '01';
  const plate = (g.guiaTransportistPlate ?? '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  return {
    tipo_documento: '11',
    serie: g.series,
    numero: String(parseInt(g.correlative, 10)),
    fecha_de_traslado: lima(g.guiaStartDate ?? g.issueDate),
    codigo_modo_transporte: mode,
    motivo_traslado: motivo,
    descripcion_motivo_traslado: motivo === '13' ? (g.guiaGoodsDescription ?? 'Otros').slice(0, 60) : '',
    peso_bruto_unidad: g.guiaWeightUnit === 'TNE' ? 'TNE' : 'KGM',
    peso_bruto_total: String(Number(g.guiaGrossWeight ?? 0)),
    numero_de_bultos: String(g.guiaPackages ?? 1),
    observaciones: '',
    formato_pdf: 'a4',
    cliente: {
      cliente_tipo_documento: clienteTipo,
      cliente_numero_documento: doc,
      cliente_denominacion: g.entityName,
      cliente_direccion: g.guiaRecipientAddress ?? '',
      codigo_pais: '',
      ubigeo: g.guiaDestUbigeo ?? '',
      cliente_email: g.entityEmail ?? '',
      cliente_telefono: '',
    },
    transportista: mode === '01'
      ? { transportista_numero_documento: g.guiaTransportistRuc ?? '', transportista_denominacion: g.guiaTransportistName ?? '', numero_registro_mtc: '' }
      : { transportista_numero_documento: '', transportista_denominacion: '', numero_registro_mtc: '' },
    conductor: mode === '02'
      ? {
          conductor_tipo_documento: '2',
          conductor_numero_documento: g.guiaDriverDocNo ?? '',
          conductor_nombres_y_apellidos: g.guiaDriverName ?? '',
          conductor_numero_licencia: (g.guiaTransportistLicense ?? '').toUpperCase(),
          conductor_numero_de_placa: plate,
        }
      : { conductor_tipo_documento: '', conductor_numero_documento: '', conductor_nombres_y_apellidos: '', conductor_numero_licencia: '', conductor_numero_de_placa: '' },
    direccion_partida: { ubigeo: g.guiaOriginUbigeo ?? '', direccion: g.guiaSenderAddress ?? '' },
    direccion_llegada: { ubigeo: g.guiaDestUbigeo ?? '', direccion: g.guiaRecipientAddress ?? '' },
    items: g.lines.map((l, i) => ({
      codigo: String(i + 1),
      cantidad: String(Number(l.qty)),
      descripcion: l.description,
      unidad: l.unitCode || 'NIU',
    })),
  };
}

/** Problemas que SUNAT rechazaría — se validan antes de llamar a Factpro. */
export function validateGuiaForGre(p: FactproGuiaBody): string[] {
  const errs: string[] = [];
  if (!/^\d{6}$/.test(p.direccion_partida.ubigeo)) errs.push('Falta el ubigeo del punto de partida');
  if (!/^\d{6}$/.test(p.direccion_llegada.ubigeo)) errs.push('Falta el ubigeo del punto de llegada');
  if (!p.direccion_partida.direccion.trim()) errs.push('Falta la dirección de partida');
  if (!p.direccion_llegada.direccion.trim()) errs.push('Falta la dirección de llegada');
  if (!(Number(p.peso_bruto_total) > 0)) errs.push('El peso bruto debe ser mayor a 0');
  if (!/^\d{8}(\d{3})?$/.test(p.cliente.cliente_numero_documento)) errs.push('El destinatario necesita RUC o DNI válido');
  if (p.codigo_modo_transporte === '01') {
    if (!/^\d{11}$/.test(p.transportista.transportista_numero_documento)) errs.push('RUC del transportista inválido');
    if (!p.transportista.transportista_denominacion.trim()) errs.push('Falta la razón social del transportista');
  } else {
    const c = p.conductor;
    if (!/^\d{8}$/.test(c.conductor_numero_documento)) errs.push('DNI del conductor inválido');
    if (!c.conductor_nombres_y_apellidos.trim()) errs.push('Falta el nombre del conductor');
    if (!/^[A-Z0-9]{9,10}$/.test(c.conductor_numero_licencia)) errs.push('La licencia del conductor debe tener 9–10 caracteres');
    if (!/^[A-Z0-9]{6,8}$/.test(c.conductor_numero_de_placa)) errs.push('Placa inválida (6–8 caracteres)');
  }
  if (!p.items.length) errs.push('La guía no tiene ítems');
  return errs;
}

export async function emitirGuia(body: FactproGuiaBody): Promise<FactproV3Response> {
  const res = await fetch(`${factproV3Base()}/guias`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(body) });
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = { exito: false, mensaje: text.slice(0, 300) }; }
  if (!res.ok && json.exito !== false) {
    throw Object.assign(new Error(`Factpro error: ${json?.mensaje ?? json?.message ?? `HTTP ${res.status}`}`), {
      statusCode: res.status >= 500 ? 502 : 422, code: 'FACTPRO_ERROR', detail: json,
    });
  }
  return json as FactproV3Response;
}

// ─── Facturas / boletas — API v3 (Sprint D) ───────────────────────────────────
// POST {v3}/documentos. El tipo lo define la serie (F… factura, B… boleta).
// Probado en DEMO 19/10/2026: factura contado/crédito y boleta con y sin DNI.
// Códigos Factpro (no SUNAT): cliente_tipo_documento 1 sin RUC/varios, 2 DNI,
// 3 CE, 4 RUC, 5 pasaporte · tipo_tax 1 IGV 18%, 20 exonerado, 30 inafecto ·
// tipo_operacion 1 venta interna.

export interface FactproDocV3Body {
  serie: string;
  numero: '#';
  tipo_operacion: '1';
  fecha_de_emision: string;           // YYYY-MM-DD
  moneda: string;
  enviar_automaticamente_al_cliente: boolean;
  cliente: {
    cliente_tipo_documento: string;
    cliente_numero_documento: string;
    cliente_denominacion: string;
    cliente_direccion: string;
    cliente_email: string;
    cliente_telefono: string;
  };
  items: {
    unidad: string; codigo: string; descripcion: string; cantidad: number;
    precio: number; incluye_tax: boolean; tipo_tax: string; descuento: number;
  }[];
  condicion_de_pago: { tipo_de_condicion: '0' | '1'; forma_de_pago: string; fecha?: string; monto: number }[];
  observaciones: string;
  formato_pdf: 'a4';
}

export function clienteTipoDocV3(docNo: string): { tipo: string; numero: string } {
  const d = (docNo ?? '').trim();
  if (/^\d{11}$/.test(d)) return { tipo: '4', numero: d };
  if (/^\d{8}$/.test(d))  return { tipo: '2', numero: d };
  if (/^[A-Za-z0-9]{9,12}$/.test(d)) return { tipo: '3', numero: d };   // CE
  return { tipo: '1', numero: '00000000' };                             // clientes varios (boleta)
}

export function buildDocumentoV3(args: {
  serie: string;
  entityDocNo: string;
  entityName: string;
  entityAddress?: string | null;
  entityEmail?: string | null;
  issueDate: Date;
  currency: string;
  paymentDueDate?: Date | null;     // si vence después de la emisión → crédito
  totalPen: number;
  observaciones?: string;
  items: { descripcion: string; cantidad: number; valorUnitario: number; igvRate: number; unidad?: string | null; codigo?: string | null }[];
}): FactproDocV3Body {
  const lima = (d: Date, fmt: 'iso' | 'pe') => fmt === 'iso'
    ? d.toLocaleDateString('en-CA', { timeZone: 'America/Lima' })
    : d.toLocaleDateString('en-GB', { timeZone: 'America/Lima' }).replace(/\//g, '-');   // dd-mm-yyyy
  const cli = clienteTipoDocV3(args.entityDocNo);
  const issueIso = lima(args.issueDate, 'iso');
  const credito = !!args.paymentDueDate && lima(args.paymentDueDate, 'iso') > issueIso;
  return {
    serie: args.serie,
    numero: '#',
    tipo_operacion: '1',
    fecha_de_emision: issueIso,
    moneda: args.currency || 'PEN',
    enviar_automaticamente_al_cliente: !!args.entityEmail,
    cliente: {
      cliente_tipo_documento: cli.tipo,
      cliente_numero_documento: cli.numero,
      cliente_denominacion: (args.entityName || 'CLIENTES VARIOS').trim(),
      cliente_direccion: args.entityAddress ?? '',
      cliente_email: args.entityEmail ?? '',
      cliente_telefono: '',
    },
    items: args.items.map(i => ({
      unidad: i.unidad || 'NIU',
      codigo: i.codigo ?? '',
      descripcion: i.descripcion,
      cantidad: i.cantidad,
      precio: Math.round(i.valorUnitario * 1e6) / 1e6,   // sin IGV
      incluye_tax: false,
      tipo_tax: i.igvRate > 0 ? '1' : '30',
      descuento: 0,
    })),
    condicion_de_pago: credito
      ? [{ tipo_de_condicion: '1', forma_de_pago: '', fecha: lima(args.paymentDueDate!, 'pe'), monto: Math.round(args.totalPen * 100) / 100 }]
      : [{ tipo_de_condicion: '0', forma_de_pago: '0', monto: 0 }],
    observaciones: args.observaciones ?? '',
    formato_pdf: 'a4',
  };
}

async function postV3(path: string, body: unknown): Promise<FactproV3Response> {
  const res = await fetch(`${factproV3Base()}${path}`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(body) });
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = { exito: false, mensaje: text.slice(0, 300) }; }
  if (!res.ok && json.exito !== false) {
    throw Object.assign(new Error(`Factpro error: ${json?.mensaje ?? json?.message ?? `HTTP ${res.status}`}`), {
      statusCode: res.status >= 500 ? 502 : 422, code: 'FACTPRO_ERROR', detail: json,
    });
  }
  return json as FactproV3Response;
}

export const emitirDocumentoV3 = (body: FactproDocV3Body) => postV3('/documentos', body);
export const consultarDocumentoV3 = (serie: string, numero: number) => postV3('/consulta', { serie, numero });

/** Mensaje legible de un error de Factpro v3. */
export function factproErrorText(res: FactproV3Response): string {
  const errs = (res as any)?.errors;
  if (Array.isArray(errs)) return errs.map((e: any) => e?.message ?? String(e)).join('; ');
  return res.mensaje ?? 'Rechazado';
}

/** REGISTRADO/ENVIADO → SENT · ACEPTADO/OBSERVADO → ACCEPTED · RECHAZADO/ANULADO o exito=false → REJECTED. */
export function v3Status(res: FactproV3Response): 'SENT' | 'ACCEPTED' | 'REJECTED' {
  const e = (res.data?.descripcion_estado ?? '').toUpperCase();
  if (res.exito === false || e.includes('RECHAZ') || e.includes('ANULAD')) return 'REJECTED';
  if (e.includes('ACEPT') || e.includes('OBSERV')) return 'ACCEPTED';
  return 'SENT';
}
