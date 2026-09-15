// ── Carga masiva de órdenes de pedido (planilla Excel) ──────────────────────
//
// Comercial keeps the daily orders in a spreadsheet. The browser parses the
// sheet and posts the rows here; this module resolves the loose text in each
// row (a customer's RUC or name, a product's SKU or name) to real ids, groups
// the rows into orders, and creates them through the normal pricing path.
//
// It is deliberately tolerant on input and strict on ambiguity: a name that
// matches two products is an error on that row, never a guess — the wrong
// product silently entering a production order is far more expensive than a
// rejected row.

import { prisma } from '../../lib/prisma';
import * as SalesService from './service';

export interface ImportRow {
  pedidoRef?:      string;   // groups rows into one order; optional
  clienteId?:      string;
  clienteRuc?:     string;   // RUC / DNI
  clienteNombre?:  string;
  sucursalId?:     string;
  sucursal?:       string;   // branch name, resolved within the row's customer
  productoId?:     string;
  productoSku?:    string;
  productoNombre?: string;
  cantidad?:       number | string;
  precioUnitario?: number | string;
  descuentoPct?:   number | string;
  fechaEntrega?:   string;   // yyyy-mm-dd
  canal?:          string;
  tipoComprobante?: string;
  notas?:          string;
}

export interface RowError { fila: number; error: string; detalle?: string }

const norm = (v: unknown) => (v ?? '').toString().trim();
const lower = (v: unknown) => norm(v).toLowerCase();

/** yyyy-mm-dd, dd/mm/yyyy or an Excel serial date → ISO date string. */
export function parseSheetDate(raw: unknown): string | null {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    // Excel serial: days since 1899-12-30.
    const ms = Math.round((raw - 25569) * 86400_000);
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }
  const s = norm(raw);
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

type Resolved<T> = { id: string; label: string } | { error: string; detalle?: string } | null;

function pickUnique<T extends { id: string }>(
  matches: T[], label: (t: T) => string, what: string, needle: string,
): Resolved<T> {
  if (matches.length === 1) return { id: matches[0].id, label: label(matches[0]) };
  if (matches.length > 1) {
    return { error: `${what} ambiguo`, detalle: `"${needle}" coincide con ${matches.length}: ${matches.slice(0, 3).map(label).join(', ')}` };
  }
  return null;
}

/**
 * Resolve every customer and product referenced by the rows in as few queries
 * as possible, so a 500-row sheet doesn't turn into 1000 round-trips.
 */
export async function buildResolvers(rows: ImportRow[]) {
  const customers = await prisma.customer.findMany({
    select: { id: true, displayName: true, docNumber: true, isActive: true },
  });
  const products = await prisma.product.findMany({
    where: { isActive: true },
    select: { id: true, sku: true, name: true, unitOfSale: true },
  });
  const sucursales = await prisma.sucursal.findMany({
    where: { isActive: true },
    select: { id: true, customerId: true, name: true, isDefaultDelivery: true },
  });

  const resolveCustomer = (r: ImportRow): Resolved<{ id: string }> => {
    if (norm(r.clienteId)) {
      const byId = customers.find(c => c.id === norm(r.clienteId));
      return byId ? { id: byId.id, label: byId.displayName } : { error: 'Cliente no encontrado', detalle: norm(r.clienteId) };
    }
    if (norm(r.clienteRuc)) {
      const doc = norm(r.clienteRuc);
      const hit = customers.filter(c => norm(c.docNumber) === doc);
      const picked = pickUnique(hit, c => (c as any).displayName, 'Cliente', doc);
      if (picked) return picked;
      return { error: 'Cliente no encontrado', detalle: `doc ${doc}` };
    }
    const name = lower(r.clienteNombre);
    if (!name) return { error: 'Falta el cliente' };
    const exact = customers.filter(c => lower(c.displayName) === name);
    const picked = pickUnique(exact, c => (c as any).displayName, 'Cliente', name)
                ?? pickUnique(customers.filter(c => lower(c.displayName).includes(name)), c => (c as any).displayName, 'Cliente', name);
    return picked ?? { error: 'Cliente no encontrado', detalle: norm(r.clienteNombre) };
  };

  const resolveProduct = (r: ImportRow): Resolved<{ id: string }> => {
    if (norm(r.productoId)) {
      const byId = products.find(p => p.id === norm(r.productoId));
      return byId ? { id: byId.id, label: byId.name } : { error: 'Producto no encontrado', detalle: norm(r.productoId) };
    }
    if (norm(r.productoSku)) {
      const sku = lower(r.productoSku);
      const hit = products.filter(p => lower(p.sku) === sku);
      const picked = pickUnique(hit, p => (p as any).name, 'Producto', sku);
      if (picked) return picked;
      return { error: 'Producto no encontrado', detalle: `SKU ${norm(r.productoSku)}` };
    }
    const name = lower(r.productoNombre);
    if (!name) return { error: 'Falta el producto' };
    const exact = products.filter(p => lower(p.name) === name);
    const picked = pickUnique(exact, p => (p as any).name, 'Producto', name)
                ?? pickUnique(products.filter(p => lower(p.name).includes(name)), p => (p as any).name, 'Producto', name);
    return picked ?? { error: 'Producto no encontrado', detalle: norm(r.productoNombre) };
  };

  /**
   * Which branch of the customer this row is for. Chains like Produsana take a
   * separate delivery per store, so the branch decides both the delivery
   * address and which rows belong to the same order.
   *
   * Resolution is scoped to the row's customer, which is what makes short names
   * like "Miraflores" safe. Mirrors what the manual order form does: an explicit
   * branch wins, then the customer's default, then its only branch — and when a
   * customer has several branches and the row names none, that's an error
   * rather than a guess, because the wrong guess sends bread to the wrong store.
   */
  const resolveSucursal = (r: ImportRow, customerId: string): Resolved<{ id: string }> => {
    const ofCustomer = sucursales.filter(s => s.customerId === customerId);

    if (norm(r.sucursalId)) {
      const byId = ofCustomer.find(s => s.id === norm(r.sucursalId));
      return byId
        ? { id: byId.id, label: byId.name }
        : { error: 'Sucursal no encontrada para este cliente', detalle: norm(r.sucursalId) };
    }

    const name = lower(r.sucursal);
    if (name) {
      if (!ofCustomer.length) {
        return { error: 'El cliente no tiene sucursales registradas', detalle: norm(r.sucursal) };
      }
      const exact = ofCustomer.filter(s => lower(s.name) === name);
      const picked = pickUnique(exact, s => (s as any).name, 'Sucursal', name)
                  ?? pickUnique(ofCustomer.filter(s => lower(s.name).includes(name)), s => (s as any).name, 'Sucursal', name);
      return picked ?? { error: 'Sucursal no encontrada', detalle: norm(r.sucursal) };
    }

    // Blank: fall back the same way the manual form does.
    if (!ofCustomer.length) return null;                       // customer doesn't use branches
    const def = ofCustomer.find(s => s.isDefaultDelivery);
    if (def) return { id: def.id, label: def.name };
    if (ofCustomer.length === 1) return { id: ofCustomer[0].id, label: ofCustomer[0].name };
    return {
      error: 'Falta la sucursal',
      detalle: `el cliente tiene ${ofCustomer.length} sucursales: ${ofCustomer.slice(0, 4).map(s => s.name).join(', ')}`,
    };
  };

  return { resolveCustomer, resolveProduct, resolveSucursal };
}

export interface ImportResult {
  creados: { orderNumber: string; id: string; cliente: string; sucursal: string | null; fechaEntrega: string | null; lineas: number; totalPen: number }[];
  errores: RowError[];
  resumen: { filas: number; pedidos: number; creados: number; conError: number };
}

/**
 * Validate (and optionally create) the orders described by `rows`.
 * With dryRun the sheet is only checked — nothing is written — which is what
 * the UI shows as a preview before the user confirms.
 */
export async function importSalesOrders(
  rows: ImportRow[], opts: { createdBy: string; dryRun?: boolean },
): Promise<ImportResult> {
  const { resolveCustomer, resolveProduct, resolveSucursal } = await buildResolvers(rows);

  type Group = {
    customerId: string; cliente: string; fechaEntrega: string | null;
    sucursalId: string | null; sucursal: string | null;
    canal: string; tipoComprobante?: string; notas: string[];
    lines: { productId: string; qty: number; unitPriceOverride?: number; discountPct?: number }[];
    filas: number[];
  };
  const groups = new Map<string, Group>();
  const errores: RowError[] = [];

  rows.forEach((r, i) => {
    const fila = i + 2; // +1 for zero-index, +1 for the header row of the sheet
    const qty = Number(r.cantidad);
    if (!Number.isFinite(qty) || qty <= 0) {
      errores.push({ fila, error: 'Cantidad inválida', detalle: norm(r.cantidad) });
      return;
    }
    const cust = resolveCustomer(r);
    if (!cust || 'error' in cust) { errores.push({ fila, error: cust?.error ?? 'Cliente no encontrado', detalle: cust && 'detalle' in cust ? cust.detalle : undefined }); return; }
    const prod = resolveProduct(r);
    if (!prod || 'error' in prod) { errores.push({ fila, error: prod?.error ?? 'Producto no encontrado', detalle: prod && 'detalle' in prod ? prod.detalle : undefined }); return; }

    const suc = resolveSucursal(r, cust.id);
    if (suc && 'error' in suc) {
      errores.push({ fila, error: suc.error, detalle: 'detalle' in suc ? suc.detalle : undefined });
      return;
    }

    const fechaEntrega = parseSheetDate(r.fechaEntrega);
    // One order per pedidoRef when given; otherwise per customer + BRANCH +
    // delivery date. The branch has to be in the key: a chain's stores each get
    // their own delivery, so without it two stores' lines would collapse into a
    // single order shipped to one address.
    const key = norm(r.pedidoRef) || `${cust.id}|${suc?.id ?? ''}|${fechaEntrega ?? ''}`;
    const g: Group = groups.get(key) ?? {
      customerId: cust.id,
      cliente: (cust as any).label ?? '',
      fechaEntrega,
      sucursalId: suc?.id ?? null,
      sucursal: suc ? ((suc as any).label ?? null) : null,
      canal: norm(r.canal) || 'SALES_AGENT',
      tipoComprobante: norm(r.tipoComprobante) || undefined,
      notas: [] as string[],
      lines: [] as Group['lines'],
      filas: [] as number[],
    };
    const precio = Number(r.precioUnitario);
    const desc   = Number(r.descuentoPct);
    g.lines.push({
      productId: prod.id,
      qty,
      ...(Number.isFinite(precio) && precio > 0 ? { unitPriceOverride: precio } : {}),
      ...(Number.isFinite(desc)   && desc   > 0 ? { discountPct: desc } : {}),
    });
    g.filas.push(fila);
    if (norm(r.notas)) g.notas.push(norm(r.notas));
    groups.set(key, g);
  });

  const creados: ImportResult['creados'] = [];
  if (!opts.dryRun) {
    for (const g of groups.values()) {
      try {
        const order = await SalesService.createOrder({
          customerId: g.customerId,
          channel: g.canal,
          ...(g.sucursalId ? { sucursalId: g.sucursalId } : {}),
          ...(g.fechaEntrega ? { deliveryDate: g.fechaEntrega } : {}),
          lines: g.lines,
          notes: g.notas.length ? g.notas.join(' · ') : undefined,
          invoiceType: g.tipoComprobante,
          createdBy: opts.createdBy,
        });
        creados.push({
          orderNumber: order.orderNumber, id: order.id, cliente: g.cliente,
          sucursal: g.sucursal,
          fechaEntrega: g.fechaEntrega, lineas: g.lines.length, totalPen: Number(order.totalPen),
        });
      } catch (err) {
        errores.push({
          fila: g.filas[0],
          error: 'No se pudo crear el pedido',
          detalle: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  return {
    creados,
    errores,
    resumen: {
      filas: rows.length,
      pedidos: groups.size,
      creados: creados.length,
      conError: errores.length,
    },
  };
}
