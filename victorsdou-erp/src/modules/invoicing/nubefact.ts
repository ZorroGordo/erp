import type { NubefactPayload, NubefactCDR } from '../../types';
import { config } from '../../config';

const CURRENCY_MAP: Record<string, number> = { PEN: 1, USD: 2 };
const DOC_TYPE_MAP: Record<string, number> = {
  FACTURA: 1, BOLETA: 3, NOTA_CREDITO: 7, NOTA_DEBITO: 8, GUIA_REMISION: 9,
};

export async function submitToNubefact(payload: NubefactPayload): Promise<NubefactCDR> {
  const url = `${config.NUBEFACT_BASE_URL}/v1/api/comprobantes`;

  const response = await fetch(url, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Token ${config.NUBEFACT_API_TOKEN}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw Object.assign(new Error(`Nubefact API error ${response.status}: ${errorBody}`), {
      statusCode: 502, code: 'NUBEFACT_ERROR',
    });
  }

  const result = await response.json() as NubefactCDR;
  return result;
}

export function buildFacturaPayload(args: {
  series: string; number: number;
  clienteRuc: string; clienteName: string; clienteAddress?: string; clienteEmail?: string;
  items: { codigo: string; descripcion: string; cantidad: number; valorUnitario: number; precioUnitario: number; igv: number; subtotal: number; total: number }[];
  totalGravada: number; totalIgv: number; total: number;
  currency?: string; tipoCambio?: number;
}): NubefactPayload {
  return {
    operacion:                    'generar_comprobante',
    tipo_de_comprobante:          DOC_TYPE_MAP['FACTURA'],
    serie:                        args.series,
    numero:                       args.number,
    sunat_transaction:            1,
    cliente_tipo_de_documento:    6, // RUC
    cliente_numero_de_documento:  args.clienteRuc,
    cliente_denominacion:         args.clienteName,
    cliente_direccion:            args.clienteAddress,
    cliente_email:                args.clienteEmail,
    fecha_de_emision:             new Date().toLocaleDateString('es-PE'),
    moneda:                       CURRENCY_MAP[args.currency ?? 'PEN'] ?? 1,
    tipo_de_cambio:               args.tipoCambio,
    porcentaje_de_igv:            18,
    total_gravada:                args.totalGravada,
    total_igv:                    args.totalIgv,
    total:                        args.total,
    items: args.items.map((item) => ({
      unidad_de_medida:          'NIU',
      codigo:                    item.codigo,
      descripcion:               item.descripcion,
      cantidad:                  item.cantidad,
      valor_unitario:            item.valorUnitario,
      precio_unitario:           item.precioUnitario,
      subtotal:                  item.subtotal,
      tipo_de_igv:               1,
      igv:                       item.igv,
      total:                     item.total,
      anticipo_regularizacion:   false,
    })),
  };
}
