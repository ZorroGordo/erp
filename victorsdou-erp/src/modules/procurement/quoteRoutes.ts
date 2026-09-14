// ── Cotizaciones de proveedor — rutas internas y página pública de aprobación ─

import type { FastifyInstance } from 'fastify';
import { requireAnyOf } from '../../middleware/auth';
import { prisma } from '../../lib/prisma';
import {
  ingestQuote, sendApprovalEmail, generatePurchaseOrder, escapeHtml,
} from './quoteService';

const LIST_SELECT = {
  id: true, quoteNumber: true, supplierId: true, supplierNameRaw: true, supplierRuc: true,
  currency: true, subtotal: true, igv: true, total: true, validUntil: true,
  status: true, source: true, senderEmail: true, emailSubject: true,
  extractionNotes: true, purchaseOrderId: true, approvedAt: true, approvedByEmail: true,
  rejectedReason: true, createdAt: true,
  supplier: { select: { id: true, businessName: true, ruc: true } },
  _count: { select: { lines: true, archivos: true } },
} as const;

export async function supplierQuoteRoutes(app: FastifyInstance) {
  // ── LIST ──────────────────────────────────────────────────────────────────
  app.get('/quotes', { preHandler: [requireAnyOf('PROCUREMENT', 'OPS_MGR', 'FINANCE_MGR')] }, async (req, reply) => {
    const q = req.query as { status?: string; supplierId?: string; limit?: string };
    const data = await prisma.supplierQuote.findMany({
      where: {
        ...(q.status ? { status: q.status as never } : {}),
        ...(q.supplierId ? { supplierId: q.supplierId } : {}),
      },
      select: LIST_SELECT,
      orderBy: { createdAt: 'desc' },
      take: q.limit ? Math.min(parseInt(q.limit), 200) : 100,
    });
    return reply.send({ data });
  });

  // ── DETAIL ────────────────────────────────────────────────────────────────
  app.get('/quotes/:id', { preHandler: [requireAnyOf('PROCUREMENT', 'OPS_MGR', 'FINANCE_MGR')] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const quote = await prisma.supplierQuote.findUnique({
      where: { id },
      include: {
        supplier: { select: { id: true, businessName: true, ruc: true } },
        lines: { orderBy: { orden: 'asc' }, include: { ingredient: { select: { id: true, name: true, baseUom: true } } } },
        archivos: { select: { id: true, nombreArchivo: true, mimeType: true, tamanoBytes: true, createdAt: true } },
      },
    });
    if (!quote) return reply.code(404).send({ error: 'Cotización no encontrada' });
    return reply.send({ data: quote });
  });

  app.get('/quotes/archivos/:archivoId/data', { preHandler: [requireAnyOf('PROCUREMENT', 'OPS_MGR', 'FINANCE_MGR')] }, async (req, reply) => {
    const { archivoId } = req.params as { archivoId: string };
    const a = await prisma.supplierQuoteArchivo.findUnique({
      where: { id: archivoId },
      select: { id: true, nombreArchivo: true, mimeType: true, dataBase64: true },
    });
    if (!a) return reply.code(404).send({ error: 'Archivo no encontrado' });
    return reply.send({ data: a });
  });

  // ── UPLOAD (manual) ───────────────────────────────────────────────────────
  // Same pipeline as the mailbox, for a quote that arrived by WhatsApp or in
  // person: the doc says those should be forwarded to the inbox, but this keeps
  // the ERP usable when someone just has the PDF in hand.
  app.post('/quotes', { preHandler: [requireAnyOf('PROCUREMENT', 'OPS_MGR')] }, async (req, reply) => {
    const b = (req.body ?? {}) as {
      archivos?: { nombreArchivo: string; mimeType: string; dataBase64: string; tamanoBytes?: number }[];
      notificarAprobador?: boolean;
    };
    if (!b.archivos?.length) return reply.code(400).send({ error: 'Adjunta al menos un archivo' });
    const quote = await ingestQuote({
      archivos: b.archivos,
      source: 'MANUAL',
      createdBy: req.actor!.sub,
      notifyApprover: b.notificarAprobador === true,
    });
    return reply.code(201).send({ data: quote });
  });

  // ── EDIT LINES ────────────────────────────────────────────────────────────
  // The extraction is a draft: purchasing fixes the ingredient, quantity, unit
  // or price of any line before the OC is generated.
  app.patch('/quotes/:id', { preHandler: [requireAnyOf('PROCUREMENT', 'OPS_MGR')] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const b = (req.body ?? {}) as {
      supplierId?: string | null;
      currency?: string;
      exchangeRate?: number;
      lines?: { id: string; ingredientId?: string | null; qty?: number; uom?: string; unitPrice?: number }[];
    };
    const quote = await prisma.supplierQuote.findUnique({ where: { id }, include: { lines: true } });
    if (!quote) return reply.code(404).send({ error: 'Cotización no encontrada' });
    if (quote.status === 'APROBADA') return reply.code(422).send({ error: 'La cotización ya generó una OC' });

    for (const l of b.lines ?? []) {
      const current = quote.lines.find(x => x.id === l.id);
      if (!current) continue;
      const qty   = l.qty != null ? Number(l.qty) : Number(current.qty);
      const price = l.unitPrice != null ? Number(l.unitPrice) : Number(current.unitPrice);
      await prisma.supplierQuoteLine.update({
        where: { id: l.id },
        data: {
          ...(l.ingredientId !== undefined ? { ingredientId: l.ingredientId || null } : {}),
          ...(l.qty != null ? { qty } : {}),
          ...(l.uom ? { uom: l.uom } : {}),
          ...(l.unitPrice != null ? { unitPrice: price } : {}),
          subtotal: parseFloat((qty * price).toFixed(4)),
        },
      });
    }

    const updated = await prisma.supplierQuote.update({
      where: { id },
      data: {
        ...(b.supplierId !== undefined ? { supplierId: b.supplierId || null } : {}),
        ...(b.currency ? { currency: b.currency.toUpperCase() } : {}),
        ...(b.exchangeRate != null ? { exchangeRate: Number(b.exchangeRate) } : {}),
      },
      include: { lines: { orderBy: { orden: 'asc' } } },
    });
    return reply.send({ data: updated });
  });

  // ── SEND / RESEND APPROVAL LINK ───────────────────────────────────────────
  app.post('/quotes/:id/send-approval', { preHandler: [requireAnyOf('PROCUREMENT', 'OPS_MGR')] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const res = await sendApprovalEmail(id);
      if (!res) return reply.code(422).send({ error: 'No hay aprobadores configurados (PURCHASE_APPROVER_EMAILS)' });
      return reply.send({ data: { enviado: true, vence: res.expires } });
    } catch (err) {
      return reply.code(422).send({ error: err instanceof Error ? err.message : 'No se pudo enviar' });
    }
  });

  // ── APPROVE INSIDE THE ERP ────────────────────────────────────────────────
  app.post('/quotes/:id/approve', { preHandler: [requireAnyOf('OPS_MGR', 'FINANCE_MGR', 'PROCUREMENT')] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    try {
      const { po, yaExistia } = await generatePurchaseOrder(id, { createdBy: req.actor!.sub });
      return reply.code(yaExistia ? 200 : 201).send({ data: po, yaExistia });
    } catch (err) {
      return reply.code(422).send({ error: err instanceof Error ? err.message : 'No se pudo generar la OC' });
    }
  });

  app.post('/quotes/:id/reject', { preHandler: [requireAnyOf('OPS_MGR', 'FINANCE_MGR', 'PROCUREMENT')] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const { reason } = (req.body ?? {}) as { reason?: string };
    const quote = await prisma.supplierQuote.update({
      where: { id },
      data: { status: 'RECHAZADA', rejectedReason: reason ?? null, approvalToken: null, approvalTokenExpiresAt: null },
    });
    return reply.send({ data: quote });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
//  Public approval page — no auth, guarded by a single-use token
// ─────────────────────────────────────────────────────────────────────────────
// Registered under /webhooks, which is the app's unauthenticated prefix. The
// token is 24 random bytes, expires, and is cleared the moment it's used.

const page = (title: string, body: string) => `<!DOCTYPE html><html lang="es"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
  body{font-family:system-ui,Segoe UI,Arial,sans-serif;background:#f7f7f5;margin:0;padding:24px;color:#111}
  .card{max-width:720px;margin:0 auto;background:#fff;border-radius:14px;padding:24px;box-shadow:0 1px 3px rgba(0,0,0,.06)}
  h1{margin:0 0 4px;font-size:20px}.sub{color:#666;font-size:14px;margin:0 0 18px}
  table{width:100%;border-collapse:collapse;font-size:14px}
  th{background:#f3f4f6;text-align:left;padding:8px}
  td{padding:8px;border-bottom:1px solid #eee}
  .r{text-align:right}
  .warn{background:#fff8e1;border:1px solid #ffe082;color:#7a5900;padding:10px;border-radius:8px;font-size:13px;margin-bottom:14px}
  .ok{background:#e8f5e9;border:1px solid #a5d6a7;color:#1b5e20;padding:14px;border-radius:10px}
  .err{background:#ffebee;border:1px solid #ef9a9a;color:#b71c1c;padding:14px;border-radius:10px}
  button{font:inherit;font-weight:600;border:0;border-radius:10px;padding:12px 20px;cursor:pointer}
  .approve{background:#166534;color:#fff}.reject{background:#fff;color:#b71c1c;border:1px solid #ef9a9a}
  form{display:inline}
</style></head><body><div class="card">${body}</div></body></html>`;

export async function supplierQuotePublicRoutes(app: FastifyInstance) {
  // The approval page posts a plain HTML form, and Fastify only parses JSON out
  // of the box — without this the button would come back 415. The body itself
  // carries nothing we need; the token in the URL is the whole request.
  app.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'string' },
    (_req, body, done) => done(null, body));

  // GET — show the quote behind the token.
  app.get('/cotizaciones/:token', async (req, reply) => {
    const { token } = req.params as { token: string };
    const quote = await prisma.supplierQuote.findUnique({
      where: { approvalToken: token },
      include: { lines: { orderBy: { orden: 'asc' } }, supplier: true },
    });
    reply.type('text/html; charset=utf-8');

    if (!quote) {
      return reply.code(404).send(page('Enlace no válido',
        `<div class="err"><strong>Enlace no válido o ya utilizado.</strong><p>Si la cotización ya fue aprobada, la orden de compra está en el ERP.</p></div>`));
    }
    if (quote.approvalTokenExpiresAt && quote.approvalTokenExpiresAt < new Date()) {
      return reply.code(410).send(page('Enlace vencido',
        `<div class="err"><strong>El enlace venció.</strong><p>Pide que se reenvíe desde el ERP.</p></div>`));
    }

    const cur = quote.currency === 'USD' ? '$' : 'S/';
    const fmt = (n: unknown) => n == null ? '—' : `${cur} ${Number(n).toFixed(2)}`;
    const proveedor = quote.supplier?.businessName ?? quote.supplierNameRaw ?? quote.senderEmail ?? 'Proveedor no identificado';
    const sinProveedor = !quote.supplierId;
    const sinIngrediente = quote.lines.filter(l => !l.ingredientId).length;

    const rows = quote.lines.map(l => `<tr>
      <td>${escapeHtml(l.descripcionRaw)}${l.ingredientId ? '' : ' <span style="color:#b26a00">(sin identificar)</span>'}</td>
      <td class="r">${Number(l.qty)} ${escapeHtml(l.uom)}</td>
      <td class="r">${l.qtyBase != null ? `${Number(l.qtyBase)} ${escapeHtml(l.baseUom ?? '')}` : '—'}</td>
      <td class="r">${fmt(l.unitPrice)}</td>
      <td class="r">${fmt(l.subtotal)}</td></tr>`).join('');

    const avisos = [
      sinProveedor ? 'La cotización no está vinculada a un proveedor registrado. Hay que vincularla en el ERP antes de generar la OC.' : null,
      sinIngrediente ? `${sinIngrediente} línea(s) sin ingrediente identificado — no entrarán en la OC.` : null,
      quote.extractionNotes,
    ].filter(Boolean).map(a => `<div class="warn">${escapeHtml(String(a))}</div>`).join('');

    const puedeAprobar = !sinProveedor && quote.lines.some(l => l.ingredientId);

    return reply.send(page(`Cotización ${quote.quoteNumber}`, `
      <h1>Cotización de ${escapeHtml(proveedor)}</h1>
      <p class="sub">${quote.quoteNumber} · recibida el ${quote.createdAt.toLocaleDateString('es-PE')}${quote.emailSubject ? ` · "${escapeHtml(quote.emailSubject)}"` : ''}</p>
      ${avisos}
      <table><thead><tr>
        <th>Producto</th><th class="r">Cantidad</th><th class="r">En stock</th><th class="r">P. unit. s/IGV</th><th class="r">Total s/IGV</th>
      </tr></thead><tbody>${rows}</tbody></table>
      <p style="font-size:15px"><strong>Total con IGV: ${fmt(quote.total)}</strong></p>
      <div style="margin-top:20px;display:flex;gap:10px">
        ${puedeAprobar
          ? `<form method="post" action="/webhooks/cotizaciones/${escapeHtml(token)}/aprobar"><button class="approve" type="submit">Aprobar y generar OC</button></form>`
          : `<span style="color:#b26a00;font-size:14px">No se puede aprobar desde aquí hasta resolver los avisos en el ERP.</span>`}
        <form method="post" action="/webhooks/cotizaciones/${escapeHtml(token)}/rechazar"><button class="reject" type="submit">Rechazar</button></form>
      </div>`));
  });

  // POST — approve: generates the OC and burns the token.
  app.post('/cotizaciones/:token/aprobar', async (req, reply) => {
    const { token } = req.params as { token: string };
    reply.type('text/html; charset=utf-8');
    const quote = await prisma.supplierQuote.findUnique({ where: { approvalToken: token } });
    if (!quote) return reply.code(404).send(page('Enlace no válido', `<div class="err">Enlace no válido o ya utilizado.</div>`));
    if (quote.approvalTokenExpiresAt && quote.approvalTokenExpiresAt < new Date()) {
      return reply.code(410).send(page('Enlace vencido', `<div class="err">El enlace venció.</div>`));
    }
    try {
      const { po } = await generatePurchaseOrder(quote.id, {
        createdBy: quote.createdBy ?? 'aprobacion-email',
        approvedByEmail: 'link',
      });
      return reply.send(page('Cotización aprobada',
        `<div class="ok"><strong>Cotización aprobada.</strong><p>Se generó la orden de compra <strong>${escapeHtml(po.poNumber)}</strong> en el ERP.</p></div>`));
    } catch (err) {
      return reply.code(422).send(page('No se pudo aprobar',
        `<div class="err"><strong>No se pudo generar la OC.</strong><p>${escapeHtml(err instanceof Error ? err.message : 'Error desconocido')}</p><p>Resuélvelo en el ERP y vuelve a intentarlo.</p></div>`));
    }
  });

  app.post('/cotizaciones/:token/rechazar', async (req, reply) => {
    const { token } = req.params as { token: string };
    reply.type('text/html; charset=utf-8');
    const quote = await prisma.supplierQuote.findUnique({ where: { approvalToken: token } });
    if (!quote) return reply.code(404).send(page('Enlace no válido', `<div class="err">Enlace no válido o ya utilizado.</div>`));
    await prisma.supplierQuote.update({
      where: { id: quote.id },
      data: { status: 'RECHAZADA', rejectedReason: 'Rechazada desde el enlace de aprobación', approvalToken: null, approvalTokenExpiresAt: null },
    });
    return reply.send(page('Cotización rechazada', `<div class="ok">Cotización rechazada. No se generó ninguna orden de compra.</div>`));
  });
}
