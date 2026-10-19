// ── Guía de remisión (remitente) — helpers ───────────────────────────────────
// Sprint C, fase A: la guía se genera desde Ventas como documento interno
// (no electrónico). Aquí viven los valores por defecto, el armado del
// pre-llenado a partir del pedido y las tablas de ubigeo / unidades SUNAT.
import { prisma } from '../../lib/prisma';
import { config } from '../../config';

export interface GuiaConfigData {
  partidaAddress?: string;
  partidaUbigeo?:  string;
  transportMode?:  '01' | '02';   // 01 público · 02 privado
  vehiclePlate?:   string;
  driverDocNo?:    string;
  driverName?:     string;
  driverLicense?:  string;
  carrierRuc?:     string;
  carrierName?:    string;
}

const GUIA_CONFIG_KEYS: (keyof GuiaConfigData)[] = [
  'partidaAddress', 'partidaUbigeo', 'transportMode', 'vehiclePlate',
  'driverDocNo', 'driverName', 'driverLicense', 'carrierRuc', 'carrierName',
];

export function cleanGuiaConfig(input: any): GuiaConfigData {
  const out: any = {};
  for (const k of GUIA_CONFIG_KEYS) {
    const v = input?.[k];
    if (typeof v === 'string' && v.trim() !== '') out[k] = v.trim();
  }
  if (out.transportMode && !['01', '02'].includes(out.transportMode)) delete out.transportMode;
  return out;
}

export async function getGuiaConfig(): Promise<GuiaConfigData> {
  const row = await prisma.guiaConfig.findUnique({ where: { id: 'singleton' } });
  const data = (row?.data ?? {}) as GuiaConfigData;
  return {
    ...data,
    partidaAddress: data.partidaAddress ?? config.COMPANY_ADDRESS ?? '',
  };
}

export async function saveGuiaConfig(data: GuiaConfigData, updatedBy?: string): Promise<GuiaConfigData> {
  const clean = cleanGuiaConfig(data);
  const row = await prisma.guiaConfig.upsert({
    where:  { id: 'singleton' },
    create: { id: 'singleton', data: clean as never, updatedBy },
    update: { data: clean as never, updatedBy },
  });
  return row.data as GuiaConfigData;
}

// ── Ubigeo INEI — Lima Metropolitana + Callao ────────────────────────────────
// Cubre la zona de reparto; fuera de ella se escribe a mano en el formulario.
const UBIGEO_LIMA_CALLAO: Record<string, string> = {
  'lima': '150101', 'cercado de lima': '150101', 'ancon': '150102', 'ate': '150103',
  'ate vitarte': '150103', 'barranco': '150104', 'brena': '150105', 'carabayllo': '150106',
  'chaclacayo': '150107', 'chorrillos': '150108', 'cieneguilla': '150109', 'comas': '150110',
  'el agustino': '150111', 'independencia': '150112', 'jesus maria': '150113',
  'la molina': '150114', 'la victoria': '150115', 'lince': '150116', 'los olivos': '150117',
  'lurigancho': '150118', 'chosica': '150118', 'lurin': '150119', 'magdalena del mar': '150120',
  'magdalena': '150120', 'pueblo libre': '150121', 'miraflores': '150122',
  'pachacamac': '150123', 'pucusana': '150124', 'puente piedra': '150125',
  'punta hermosa': '150126', 'punta negra': '150127', 'rimac': '150128',
  'san bartolo': '150129', 'san borja': '150130', 'san isidro': '150131',
  'san juan de lurigancho': '150132', 'sjl': '150132', 'san juan de miraflores': '150133',
  'sjm': '150133', 'san luis': '150134', 'san martin de porres': '150135', 'smp': '150135',
  'san miguel': '150136', 'santa anita': '150137', 'santa maria del mar': '150138',
  'santa rosa': '150139', 'santiago de surco': '150140', 'surco': '150140',
  'surquillo': '150141', 'villa el salvador': '150142', 'villa maria del triunfo': '150143',
  'callao': '070101', 'bellavista': '070102', 'carmen de la legua reynoso': '070103',
  'carmen de la legua': '070103', 'la perla': '070104', 'la punta': '070105',
  'ventanilla': '070106', 'mi peru': '070107',
};

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/\s+/g, ' ');

export function ubigeoForDistrict(district?: string | null): string {
  if (!district) return '';
  return UBIGEO_LIMA_CALLAO[norm(district)] ?? '';
}

// ── Unidad de venta → código de unidad SUNAT (catálogo 03) ───────────────────
export function sunatUnitCode(unitOfSale?: string | null): string {
  const u = norm(unitOfSale ?? 'unit');
  if (['kg', 'kgs', 'kilo', 'kilos', 'kilogramo', 'kilogramos'].includes(u)) return 'KGM';
  if (['g', 'gr', 'grs', 'gramo', 'gramos'].includes(u)) return 'GRM';
  if (['l', 'lt', 'lts', 'litro', 'litros'].includes(u)) return 'LTR';
  if (['ml', 'mililitro', 'mililitros'].includes(u)) return 'MLT';
  if (['caja', 'cajas', 'box'].includes(u)) return 'BX';
  if (['paquete', 'paquetes', 'pack', 'pqt'].includes(u)) return 'PK';
  if (['bolsa', 'bolsas', 'bag'].includes(u)) return 'BG';
  return 'NIU';
}

// Peso a partir del nombre ("PAN CAMPESINO 800 GR", "Harina 1 KG") cuando el
// producto no tiene weightGrams cargado.
export function gramsFromName(name?: string | null): number | null {
  if (!name) return null;
  const m = name.match(/(\d+(?:[.,]\d+)?)\s*(kg|kilos?|gr|grs|g)\b/i);
  if (!m) return null;
  const n = parseFloat(m[1].replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0) return null;
  return /^k/i.test(m[2]) ? Math.round(n * 1000) : Math.round(n);
}

// ── Pre-llenado de la guía desde un pedido ───────────────────────────────────
export async function buildGuiaPrefill(orderId: string) {
  const order = await prisma.salesOrder.findUnique({
    where: { id: orderId },
    include: {
      customer: { include: { addresses: true } },
      sucursal: true,
      lines: { include: { product: true } },
      invoices: {
        where: { docType: 'GUIA_REMISION', status: { not: 'VOIDED' } },
        select: { id: true, series: true, correlative: true, status: true },
      },
    },
  });
  if (!order) return null;

  const cfg = await getGuiaConfig();

  // Punto de llegada: sucursal → dirección del pedido (e-commerce) → dirección del cliente
  let llegadaAddress = '';
  let llegadaDistrict = '';
  if (order.sucursal) {
    const s = order.sucursal;
    llegadaAddress = [s.addressLine1, s.addressLine2, s.district, s.province].filter(Boolean).join(', ');
    llegadaDistrict = s.district;
  } else if ((order.addressSnap as any)?.street) {
    const a = order.addressSnap as any;
    llegadaAddress = [a.street, a.district, a.city].filter(Boolean).join(', ');
    llegadaDistrict = a.district ?? '';
  } else {
    const addrs = order.customer?.addresses ?? [];
    const a = addrs.find(x => x.isDefault) ?? addrs[0];
    if (a) {
      llegadaAddress = [a.addressLine1, a.addressLine2, a.district, a.province].filter(Boolean).join(', ');
      llegadaDistrict = a.district;
    }
  }

  const items = order.lines.map(l => {
    const qty = Number(l.qty);
    const grams = l.product?.weightGrams ?? gramsFromName(l.product?.name);
    return {
      productId:   l.productId,
      sku:         l.product?.sku ?? '',
      description: l.product?.name ?? 'Producto',
      qty,
      unitCode:    sunatUnitCode(l.product?.unitOfSale),
      weightKg:    grams != null ? (grams * qty) / 1000 : null,
    };
  });
  const knownWeights = items.filter(i => i.weightKg != null);
  const grossWeightKg = knownWeights.length
    ? Math.round(knownWeights.reduce((s, i) => s + (i.weightKg ?? 0), 0) * 1000) / 1000
    : null;

  // Pedidos e-commerce cuelgan de un cliente genérico ("Tienda Online"): el
  // destinatario real es quien compró en la web.
  const customer = order.customer;
  const isEcom = order.channel === 'ECOMMERCE';
  const docNo = customer?.docNumber ?? '';
  return {
    order: {
      id: order.id, orderNumber: order.orderNumber, status: order.status,
      deliveryDate: order.deliveryDate, sucursalName: order.sucursal?.name ?? null,
    },
    existingGuia: order.invoices[0] ?? null,
    recipient: {
      docType:  customer?.docType ?? '',
      docNo:    /^\d{8}(\d{3})?$/.test(docNo) ? docNo : '',
      name:     (isEcom && order.ecommerceCustomerName) ? order.ecommerceCustomerName : (customer?.displayName ?? order.ecommerceCustomerName ?? ''),
    },
    sender: {
      ruc:  config.COMPANY_RUC,
      name: config.COMPANY_NAME,
    },
    partida: { address: cfg.partidaAddress ?? '', ubigeo: cfg.partidaUbigeo ?? '' },
    llegada: { address: llegadaAddress, ubigeo: ubigeoForDistrict(llegadaDistrict) },
    startDate: (order.deliveryDate ?? new Date()).toISOString().slice(0, 10),
    items,
    grossWeightKg,
    allWeightsKnown: knownWeights.length === items.length,
    transport: {
      mode:          cfg.transportMode ?? '02',
      vehiclePlate:  cfg.vehiclePlate ?? '',
      driverDocNo:   cfg.driverDocNo ?? '',
      driverName:    cfg.driverName ?? '',
      driverLicense: cfg.driverLicense ?? '',
      carrierRuc:    cfg.carrierRuc ?? '',
      carrierName:   cfg.carrierName ?? '',
    },
  };
}
