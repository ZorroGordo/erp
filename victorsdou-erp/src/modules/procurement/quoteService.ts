// ── Cotizaciones de proveedor: ingesta, extracción y aprobación ──────────────
//
// Flow, end to end:
//   1. the supplier emails a quote to QUOTES_INBOX (SES → S3 → SNS → the
//      inbound-email webhook), or someone uploads the PDF in the ERP;
//   2. the document's text is read (pdf-parse, OCR fallback) and Claude turns
//      it into structured lines — supplier layouts vary too much for regex;
//   3. each line is matched to an Ingredient and its presentation converted to
//      the stock unit (1 saco = 50 kg) via the uom_conversions table;
//   4. the approver gets an email with a signed, single-use link;
//   5. clicking Aprobar generates the OC.
//
// Every step degrades rather than fails: no API key, unreadable PDF or an
// unmatched line all end with a quote a human can finish by hand.

import { randomBytes } from 'crypto';
import { prisma } from '../../lib/prisma';
import { config } from '../../config';
import { sendEmail } from '../../lib/email';
import { llmJson, llmEnabled } from '../../lib/llm';
import { documentToText } from '../comprobantes/extractor';
import { resolveConvertQty } from '../../lib/uomResolver';

export interface ExtractedQuoteLine {
  descripcion: string;
  cantidad: number;
  unidad: string;
  precioUnitarioSinIgv: number;
  totalSinIgv?: number | null;
  igv?: number | null;
  totalConIgv?: number | null;
}

export interface ExtractedQuote {
  proveedor?: string | null;
  ruc?: string | null;
  moneda?: string | null;
  validoHasta?: string | null;
  subtotal?: number | null;
  igv?: number | null;
  total?: number | null;
  lineas: ExtractedQuoteLine[];
  notas?: string | null;
}

const EXTRACTION_SYSTEM = `Eres un asistente de compras de una panadería en Perú.
Recibes el texto de una COTIZACIÓN de un proveedor y devuelves sus datos estructurados.
Reglas:
- Responde SOLO con un objeto JSON válido, sin texto adicional ni bloques de código.
- Los precios son en la moneda de la cotización (PEN por defecto, USD si el documento lo indica).
- "precioUnitarioSinIgv" siempre SIN IGV. Si el documento sólo da precios con IGV, divide entre 1.18 y anótalo en "notas".
- "unidad" es la presentación tal como aparece (saco, caja, bolsa, kg, litro, unidad…). No la conviertas.
- "cantidad" es la cantidad de esa presentación.
- No inventes líneas ni montos. Si un dato no está, usa null.
- Si el texto no parece una cotización, devuelve {"lineas": [], "notas": "no parece una cotización"}.`;

function extractionPrompt(text: string): string {
  return `Extrae los datos de esta cotización y devuélvelos en este formato JSON exacto:

{
  "proveedor": string|null,
  "ruc": string|null,
  "moneda": "PEN"|"USD"|null,
  "validoHasta": "YYYY-MM-DD"|null,
  "subtotal": number|null,
  "igv": number|null,
  "total": number|null,
  "notas": string|null,
  "lineas": [
    {
      "descripcion": string,
      "cantidad": number,
      "unidad": string,
      "precioUnitarioSinIgv": number,
      "totalSinIgv": number|null,
      "igv": number|null,
      "totalConIgv": number|null
    }
  ]
}

--- TEXTO DE LA COTIZACIÓN ---
${text.slice(0, 60_000)}
--- FIN ---`;
}

/** Read a quote document into structured lines. Returns null when unreadable. */
export async function extractQuote(mimeType: string, dataBase64: string): Promise<{ parsed: ExtractedQuote | null; text: string; nota: string | null }> {
  const text = await documentToText(mimeType, dataBase64);
  if (!text || text.trim().length < 30) {
    return { parsed: null, text: text ?? '', nota: 'No se pudo leer texto del documento (¿escaneo de baja calidad?)' };
  }
  if (!llmEnabled()) {
    return { parsed: null, text, nota: 'Extracción con IA no configurada (falta ANTHROPIC_API_KEY): completar las líneas a mano' };
  }
  const parsed = await llmJson<ExtractedQuote>(extractionPrompt(text), { system: EXTRACTION_SYSTEM, maxTokens: 4096 });
  if (!parsed) return { parsed: null, text, nota: 'La extracción automática no devolvió un resultado utilizable' };
  return { parsed, text, nota: null };
}

// ── Matching ────────────────────────────────────────────────────────────────

const normalize = (v: string) =>
  (v ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * Match a quote line's free text to an ingredient. Word-overlap scoring, with a
 * deliberately high bar: leaving a line unmatched costs one dropdown click,
 * while a wrong match quietly buys the wrong thing.
 */
export function matchIngredient(
  descripcion: string,
  ingredients: { id: string; name: string; baseUom: string }[],
): { id: string; name: string; baseUom: string } | null {
  const needle = normalize(descripcion);
  if (!needle) return null;

  const exact = ingredients.find(i => normalize(i.name) === needle);
  if (exact) return exact;

  const words = needle.split(' ').filter(w => w.length > 2);
  if (!words.length) return null;

  let best: { ing: typeof ingredients[number]; score: number } | null = null;
  for (const ing of ingredients) {
    const target = normalize(ing.name);
    const targetWords = target.split(' ').filter(w => w.length > 2);
    if (!targetWords.length) continue;
    const hits = targetWords.filter(w => words.includes(w)).length;
    if (!hits) continue;
    // Require most of the ingredient's own words to appear in the description.
    const score = hits / targetWords.length;
    if (!best || score > best.score) best = { ing, score };
  }
  return best && best.score >= 0.6 ? best.ing : null;
}

/**
 * Attach the quote to a known supplier. RUC first (exact, unambiguous), then the
 * sender's email against the supplier's registered address, then the business
 * name — and only when the name matches exactly one supplier. The sender's
 * domain is deliberately NOT used as a name: "ventas@distribuidoracesar.com"
 * matching some other "Distribuidora" by substring is how a quote gets billed to
 * the wrong company.
 */
export async function matchSupplier(opts: { ruc?: string | null; nombre?: string | null; email?: string | null }) {
  const ruc = (opts.ruc ?? '').replace(/\D/g, '');
  if (ruc.length >= 8) {
    const byRuc = await prisma.supplier.findFirst({ where: { ruc } });
    if (byRuc) return byRuc;
  }

  const email = (opts.email ?? '').trim().toLowerCase();
  if (email) {
    const byEmail = await prisma.supplier.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
    });
    if (byEmail) return byEmail;
  }

  const nombre = (opts.nombre ?? '').trim();
  if (nombre.length >= 4) {
    const matches = await prisma.supplier.findMany({
      where: { businessName: { contains: nombre, mode: 'insensitive' } },
      take: 2,
    });
    if (matches.length === 1) return matches[0];
  }
  return null;
}

// ── Creation ────────────────────────────────────────────────────────────────

export interface IngestInput {
  archivos: { nombreArchivo: string; mimeType: string; dataBase64: string; tamanoBytes?: number }[];
  senderEmail?: string | null;
  emailSubject?: string | null;
  messageId?: string | null;
  source?: 'EMAIL' | 'MANUAL';
  createdBy?: string | null;
  /// Send the approval email right away (the default for email ingestion).
  notifyApprover?: boolean;
}

/**
 * Register a quote from one or more attachments: extract, match, convert, and
 * (optionally) email the approver a link.
 */
export async function ingestQuote(input: IngestInput) {
  const principal = input.archivos[0];
  if (!principal) throw new Error('La cotización no tiene archivos');

  // Redelivered SNS notification → same Message-Id → don't create a twin.
  if (input.messageId) {
    const dup = await prisma.supplierQuote.findUnique({ where: { messageId: input.messageId } });
    if (dup) return dup;
  }

  const { parsed, nota } = await extractQuote(principal.mimeType, principal.dataBase64);

  const supplier = await matchSupplier({
    ruc: parsed?.ruc,
    nombre: parsed?.proveedor,
    // The From: header is "Nombre <correo@dominio>"; keep just the address.
    email: (input.senderEmail ?? '').match(/[^<\s]+@[^>\s]+/)?.[0] ?? null,
  });
  const ingredients = await prisma.ingredient.findMany({
    where: { isActive: true },
    select: { id: true, name: true, baseUom: true },
  });

  const moneda = (parsed?.moneda ?? 'PEN').toUpperCase();
  const lineas = parsed?.lineas ?? [];

  const lineData = [];
  for (const [i, l] of lineas.entries()) {
    const qty   = Number(l.cantidad) || 0;
    const price = Number(l.precioUnitarioSinIgv) || 0;
    const ing   = matchIngredient(l.descripcion ?? '', ingredients);

    // Presentation → stock unit, e.g. 2 saco → 100 kg when a conversion exists.
    let qtyBase: number | null = null;
    let baseUom: string | null = null;
    let factor: number | null = null;
    if (ing) {
      const conv = await resolveConvertQty(qty, l.unidad ?? ing.baseUom, ing.baseUom, ing.id);
      baseUom = ing.baseUom;
      factor  = conv.factor;
      qtyBase = parseFloat(conv.qty.toFixed(4));
    }

    lineData.push({
      descripcionRaw: (l.descripcion ?? '').slice(0, 500) || `Línea ${i + 1}`,
      ingredientId: ing?.id ?? null,
      qty,
      uom: (l.unidad ?? 'unidad').toString().slice(0, 40),
      unitPrice: price,
      subtotal: l.totalSinIgv != null ? Number(l.totalSinIgv) : parseFloat((qty * price).toFixed(4)),
      igv: l.igv != null ? Number(l.igv) : null,
      total: l.totalConIgv != null ? Number(l.totalConIgv) : null,
      qtyBase, baseUom, conversionFactor: factor,
      orden: i,
    });
  }

  const sinMatch = lineData.filter(l => !l.ingredientId).length;
  const notas = [
    nota,
    sinMatch ? `${sinMatch} línea(s) sin ingrediente identificado` : null,
    parsed?.notas ?? null,
  ].filter(Boolean).join(' · ') || null;

  const quote = await prisma.supplierQuote.create({
    data: {
      quoteNumber: `COT-${Date.now()}`,
      supplierId: supplier?.id ?? null,
      supplierNameRaw: parsed?.proveedor ?? null,
      supplierRuc: parsed?.ruc ?? null,
      currency: moneda === 'USD' ? 'USD' : 'PEN',
      subtotal: parsed?.subtotal ?? null,
      igv: parsed?.igv ?? null,
      total: parsed?.total ?? null,
      validUntil: parsed?.validoHasta ? new Date(parsed.validoHasta) : null,
      status: lineData.length ? 'RECIBIDA' : 'ERROR',
      source: (input.source ?? 'EMAIL') as never,
      senderEmail: input.senderEmail ?? null,
      emailSubject: input.emailSubject ?? null,
      messageId: input.messageId ?? null,
      extractedJson: (parsed ?? null) as never,
      extractionNotes: notas,
      createdBy: input.createdBy ?? null,
      lines: lineData.length ? { create: lineData } : undefined,
      archivos: {
        create: input.archivos.map(a => ({
          nombreArchivo: a.nombreArchivo,
          mimeType: a.mimeType,
          tamanoBytes: a.tamanoBytes ?? Math.round((a.dataBase64.length * 3) / 4),
          dataBase64: a.dataBase64,
        })),
      },
    },
    include: { lines: true, supplier: true },
  });

  if (input.notifyApprover !== false && lineData.length) {
    await sendApprovalEmail(quote.id).catch(err => console.error('[quote] approval email:', err));
  }

  return quote;
}

// ── Approval link ───────────────────────────────────────────────────────────

const money = (n: number | null | undefined, cur = 'PEN') =>
  n == null ? '—' : `${cur === 'USD' ? '$' : 'S/'} ${Number(n).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Issue a fresh single-use token and email the approver the link. */
export async function sendApprovalEmail(quoteId: string) {
  const quote = await prisma.supplierQuote.findUnique({
    where: { id: quoteId },
    include: { lines: { orderBy: { orden: 'asc' } }, supplier: true },
  });
  if (!quote) throw new Error('Cotización no encontrada');

  // Approvers, or the ops alert address as a fallback, so the link still gets
  // somewhere useful before anyone configures the dedicated variable.
  const to = (config.PURCHASE_APPROVER_EMAILS || config.OPS_ALERT_EMAIL || '')
    .split(',').map(s => s.trim()).filter(Boolean);
  if (!to.length) {
    console.warn('[quote] PURCHASE_APPROVER_EMAILS sin configurar — no se envía el link de aprobación');
    return null;
  }

  const token = randomBytes(24).toString('hex');
  const expires = new Date(Date.now() + config.QUOTE_APPROVAL_TTL_DAYS * 86400_000);
  await prisma.supplierQuote.update({
    where: { id: quote.id },
    data: { approvalToken: token, approvalTokenExpiresAt: expires, status: 'EN_APROBACION' },
  });

  const link = `${config.PUBLIC_API_URL.replace(/\/$/, '')}/webhooks/cotizaciones/${token}`;
  const proveedor = quote.supplier?.businessName ?? quote.supplierNameRaw ?? quote.senderEmail ?? 'Proveedor no identificado';
  const cur = quote.currency;

  const rows = quote.lines.map(l => `
    <tr>
      <td style="padding:6px 8px;border-bottom:1px solid #eee;">${escapeHtml(l.descripcionRaw)}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right;">${Number(l.qty)} ${escapeHtml(l.uom)}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right;">${money(Number(l.unitPrice), cur)}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right;">${money(l.subtotal != null ? Number(l.subtotal) : null, cur)}</td>
    </tr>`).join('');

  const html = `<!DOCTYPE html><html lang="es"><body style="font-family:system-ui,Segoe UI,Arial,sans-serif;background:#f7f7f5;padding:24px;">
  <div style="max-width:640px;margin:0 auto;background:#fff;border-radius:12px;padding:24px;">
    <h2 style="margin:0 0 4px;">Cotización recibida</h2>
    <p style="margin:0 0 16px;color:#666;font-size:14px;">${escapeHtml(proveedor)} · ${quote.quoteNumber}</p>
    ${quote.extractionNotes ? `<p style="background:#fff8e1;border:1px solid #ffe082;padding:8px 10px;border-radius:8px;font-size:13px;color:#7a5900;">${escapeHtml(quote.extractionNotes)}</p>` : ''}
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      <thead><tr style="background:#f3f4f6;">
        <th style="padding:6px 8px;text-align:left;">Producto</th>
        <th style="padding:6px 8px;text-align:right;">Cantidad</th>
        <th style="padding:6px 8px;text-align:right;">P. unit. s/IGV</th>
        <th style="padding:6px 8px;text-align:right;">Total s/IGV</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p style="font-size:14px;margin:16px 0 4px;"><strong>Total con IGV: ${money(quote.total != null ? Number(quote.total) : null, cur)}</strong></p>
    <p style="margin:20px 0 8px;">
      <a href="${link}" style="display:inline-block;background:#166534;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600;">Revisar y aprobar</a>
    </p>
    <p style="font-size:12px;color:#888;">El enlace es de un solo uso y vence el ${expires.toLocaleDateString('es-PE')}. Al aprobar se genera la orden de compra en el ERP.</p>
  </div></body></html>`;

  await sendEmail({
    to,
    subject: `Cotización de ${proveedor} — ${money(quote.total != null ? Number(quote.total) : null, cur)}`,
    html,
  });
  return { token, expires };
}

export function escapeHtml(s: string): string {
  return (s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

// ── Quote → OC ──────────────────────────────────────────────────────────────

/**
 * Generate the purchase order from an approved quote. Only lines matched to an
 * ingredient become OC lines — an OC line needs an ingredient, and guessing one
 * is exactly the failure mode this flow is supposed to avoid.
 */
export async function generatePurchaseOrder(quoteId: string, opts: { createdBy: string; approvedByEmail?: string | null }) {
  const quote = await prisma.supplierQuote.findUnique({
    where: { id: quoteId },
    include: { lines: { orderBy: { orden: 'asc' } } },
  });
  if (!quote) throw new Error('Cotización no encontrada');
  if (quote.purchaseOrderId) {
    const existing = await prisma.purchaseOrder.findUnique({ where: { id: quote.purchaseOrderId } });
    if (existing) return { po: existing, yaExistia: true };
  }
  if (!quote.supplierId) throw new Error('La cotización no está vinculada a un proveedor registrado');

  const usable = quote.lines.filter(l => l.ingredientId && Number(l.qty) > 0);
  if (!usable.length) throw new Error('Ninguna línea tiene un ingrediente identificado');

  const rate = Number(quote.exchangeRate) || 1;
  const lines = usable.map(l => {
    const qty   = Number(l.qty);
    const price = Number(l.unitPrice);
    return {
      ingredientId: l.ingredientId!,
      qtyOrdered:   qty,
      uom:          l.uom,
      unitPrice:    price,
      lineTotalPen: parseFloat((qty * price * rate).toFixed(4)),
      qtyBase:      l.qtyBase,
      baseUom:      l.baseUom,
      conversionFactor: l.conversionFactor,
    };
  });

  const subtotal = lines.reduce((s, l) => s + l.lineTotalPen, 0);
  const igv = parseFloat((subtotal * 0.18).toFixed(4));

  const po = await prisma.purchaseOrder.create({
    data: {
      poNumber: `PO-${Date.now()}`,
      supplierId: quote.supplierId,
      currency: quote.currency,
      exchangeRate: rate,
      subtotalPen: subtotal,
      igvPen: igv,
      totalPen: parseFloat((subtotal + igv).toFixed(4)),
      notes: `Generada desde la cotización ${quote.quoteNumber}`,
      createdBy: opts.createdBy,
      lines: { create: lines },
    },
    include: { lines: { include: { ingredient: true } }, supplier: true },
  });

  await prisma.supplierQuote.update({
    where: { id: quote.id },
    data: {
      status: 'APROBADA',
      approvedAt: new Date(),
      approvedByEmail: opts.approvedByEmail ?? null,
      purchaseOrderId: po.id,
      approvalToken: null,            // single use
      approvalTokenExpiresAt: null,
    },
  });

  // Carry the quote's PDF onto the OC, so the document that justifies it is
  // attached where purchasing will look for it.
  const archivos = await prisma.supplierQuoteArchivo.findMany({ where: { quoteId: quote.id } });
  for (const a of archivos) {
    await prisma.purchaseOrderAttachment.create({
      data: {
        purchaseOrderId: po.id,
        kind: 'COTIZACION',
        nombreArchivo: a.nombreArchivo,
        mimeType: a.mimeType,
        tamanoBytes: a.tamanoBytes,
        dataBase64: a.dataBase64,
        createdBy: opts.createdBy,
      },
    }).catch(err => console.error('[quote] copy attachment:', err));
  }

  return { po, yaExistia: false };
}
