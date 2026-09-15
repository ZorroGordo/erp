import type { FastifyInstance } from 'fastify';
import { requireAnyOf } from '../../middleware/auth';
import { prisma } from '../../lib/prisma';
import { notifyPurchaseOrderCreated } from '../../services/notifications';
import { registerReceipt } from '../inventory/service';
import { resolveConvertQty } from '../../lib/uomResolver';
import { autoExtract, archivoTipoFromMime } from '../comprobantes/extractor';
import { extractLotsFromAttachment, type DetectedLot } from './certExtractor';

// Convert '' / null / undefined to null; otherwise coerce to a finite number.
function toNumberOrNull(v: unknown): number | null {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// Whitelist + coerce the supplier form payload to valid Supplier columns. The
// UI sends extra/empty fields (cci, creditLimit, detracción…) that must be
// mapped to the right types, otherwise Prisma rejects the whole create.
function normalizeSupplierBody(b: any) {
  return {
    businessName:       b.businessName,
    ruc:                b.ruc,
    contactName:        b.contactName || null,
    email:              b.email || null,
    phone:              b.phone || null,
    address:            b.address || null,
    paymentTermsDays:   b.paymentTermsDays != null && b.paymentTermsDays !== '' ? Number(b.paymentTermsDays) : 30,
    paymentDayOfMonth:  b.paymentDayOfMonth || null,
    paymentMethod:      b.paymentMethod || null,
    bankName:           b.bankName || null,
    bankAccount:        b.bankAccount || null,
    cci:                b.cci || null,
    creditLimit:        toNumberOrNull(b.creditLimit),
    currency:           b.currency || 'PEN',
    requiresDetraccion: !!b.requiresDetraccion,
    detraccionRate:     toNumberOrNull(b.detraccionRate),
    notes:              b.notes || null,
  };
}


// ── Presentation → base unit for PO lines ────────────────────────────────────
// The OC is written in the supplier's presentation ("2 sacos"); inventory works
// in the ingredient's master unit ("100 kg"). Resolve the factor at write time
// (uom_conversions table first, dimensional table as fallback) and store the
// converted quantity alongside the ordered one, so the OC itself already shows
// what will land in stock instead of only discovering it at receipt.
type LineDraft = {
  ingredientId: string;
  qtyOrdered:   number;
  uom:          string;
  unitPrice:    number;
  lineTotalPen: number;
};

async function withBaseUnits(lines: LineDraft[]) {
  const ids  = [...new Set(lines.map(l => l.ingredientId))];
  const ings = await prisma.ingredient.findMany({
    where: { id: { in: ids } },
    select: { id: true, baseUom: true },
  });
  const baseByIng = new Map(ings.map(i => [i.id, i.baseUom]));

  return Promise.all(lines.map(async l => {
    const baseUom = baseByIng.get(l.ingredientId) ?? null;
    if (!baseUom) return { ...l, qtyBase: null, baseUom: null, conversionFactor: null };
    const conv = await resolveConvertQty(l.qtyOrdered, l.uom, baseUom, l.ingredientId);
    return {
      ...l,
      baseUom,
      conversionFactor: conv.factor,
      qtyBase: parseFloat(conv.qty.toFixed(4)),
    };
  }));
}

export async function procurementRoutes(app: FastifyInstance) {
  app.get('/purchase-orders', { preHandler: [requireAnyOf('PROCUREMENT', 'OPS_MGR', 'FINANCE_MGR')] }, async (req, reply) => {
    const q = req.query as { status?: string; supplierId?: string; search?: string; limit?: string };
    const take = q.limit ? Math.min(parseInt(q.limit), 100) : undefined;
    const where: any = {
      ...(q.status     ? { status: q.status as never } : {}),
      ...(q.supplierId ? { supplierId: q.supplierId }  : {}),
      ...(q.search ? {
        OR: [
          { poNumber:  { contains: q.search, mode: 'insensitive' } },
          { supplier:  { businessName: { contains: q.search, mode: 'insensitive' } } },
          { supplier:  { ruc: { contains: q.search } } },
        ],
      } : {}),
    };
    const orders = await prisma.purchaseOrder.findMany({
      where,
      take,
      include: { supplier: { select: { id: true, businessName: true, ruc: true } }, lines: { include: { ingredient: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return reply.send({ data: orders });
  });

  app.post('/purchase-orders', { preHandler: [requireAnyOf('PROCUREMENT')] }, async (req, reply) => {
    const body = req.body as {
      supplierId: string;
      currency?: string;
      exchangeRate?: number;
      lines: { ingredientId: string; qtyOrdered?: number; quantity?: number; uom?: string; unitPrice?: number; unitPricePen?: number }[];
      expectedDeliveryDate?: string;
      notes?: string;
    };

    if (!body.supplierId) return reply.code(400).send({ error: 'supplierId es requerido' });

    // Currency of the order. Line prices are entered in this currency; totals are
    // always stored in soles using the exchange rate (S/ per foreign unit) so
    // stock valuation stays in soles regardless of the purchase currency.
    const currency = (body.currency || 'PEN').toUpperCase();
    const rate = currency === 'PEN' ? 1 : (Number(body.exchangeRate) || 1);

    // The UI sends { ingredientId, quantity, unitPricePen, uom }; the schema uses
    // qtyOrdered / unitPrice. Map both spellings and coerce to numbers so we never
    // persist NaN (which previously broke the whole create with a misleading
    // "Argument `supplier` is missing" Prisma error). unitPrice is stored in the
    // PO currency; lineTotalPen is the soles-converted line total.
    const lines = (body.lines ?? [])
      .filter(l => l.ingredientId)
      .map(l => {
        const qty   = Number(l.qtyOrdered ?? l.quantity ?? 0) || 0;
        const price = Number(l.unitPrice ?? l.unitPricePen ?? 0) || 0;
        return {
          ingredientId: l.ingredientId,
          qtyOrdered:   qty,
          uom:          l.uom || 'unidad',
          unitPrice:    price,
          lineTotalPen: parseFloat((qty * price * rate).toFixed(4)),
        };
      });

    if (lines.length === 0) return reply.code(400).send({ error: 'La OC debe tener al menos una línea' });

    const linesWithBase = await withBaseUnits(lines);

    const subtotal = lines.reduce((sum, l) => sum + l.lineTotalPen, 0);
    const igv = parseFloat((subtotal * 0.18).toFixed(4));
    const po = await prisma.purchaseOrder.create({
      data: {
        poNumber: `PO-${Date.now()}`, supplierId: body.supplierId,
        currency, exchangeRate: rate,
        subtotalPen: subtotal, igvPen: igv, totalPen: parseFloat((subtotal + igv).toFixed(4)),
        expectedDeliveryDate: body.expectedDeliveryDate ? new Date(body.expectedDeliveryDate) : undefined,
        notes: body.notes, createdBy: req.actor!.sub,
        lines: { create: linesWithBase },
      },
      include: { lines: { include: { ingredient: true } }, supplier: true },
    });

    // Fire-and-forget: notify supplier + ops
    notifyPurchaseOrderCreated({
      poNumber: po.poNumber,
      totalPen: Number(po.totalPen),
      supplier: { businessName: po.supplier.businessName, email: (po.supplier as any).email ?? null },
    }).catch(console.error);

    return reply.code(201).send({ data: po });
  });

  app.patch('/purchase-orders/:id/approve', { preHandler: [requireAnyOf('OPS_MGR', 'FINANCE_MGR')] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const { approved, reason } = (req.body ?? {}) as { approved?: boolean; reason?: string };
    // Default to approving: this endpoint is the "Aprobar" action, so an empty
    // body must approve — previously undefined fell through to CANCELLED.
    const isApproved = approved !== false;
    const po = await prisma.purchaseOrder.update({
      where: { id },
      data: {
        status: isApproved ? 'APPROVED' : 'CANCELLED',
        approvedBy: req.actor!.sub,
        approvedAt: new Date(),
        ...(reason ? { notes: reason } : {}),
      },
    });
    return reply.send({ data: po });
  });

  // ── POST /purchase-orders/:id/receive — ingest an approved OC into inventory ──
  //
  // Turns an approved (or partially received / sent) purchase order into actual
  // stock: for every line it registers a PURCHASE_RECEIPT (WAC + optional lote),
  // records the received quantity, writes a GoodsReceiptNote for traceability and
  // moves the OC to FULLY_RECEIVED / PARTIAL_RECEIVED. This is the "dar ingreso al
  // stock desde el módulo de compras" action requested by the user — it avoids
  // re-typing every line manually in the Inventory module.
  app.post('/purchase-orders/:id/receive', {
    preHandler: [requireAnyOf('WAREHOUSE', 'OPS_MGR', 'PROCUREMENT', 'SUPER_ADMIN')],
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as {
      warehouseId: string;
      receivedDate?: string;
      notes?: string;
      lines?: {
        lineId:          string;
        qtyReceived?:    number;
        unitCostPen?:    number;
        lotNumber?:      string;
        expiryDate?:     string;
        productionDate?: string;
      }[];
    };

    if (!body.warehouseId) return reply.code(400).send({ error: 'Almacén es requerido' });

    const po = await prisma.purchaseOrder.findUnique({
      where: { id },
      include: { lines: { include: { ingredient: true } } },
    });
    if (!po) return reply.code(404).send({ error: 'OC no encontrada' });

    const RECEIVABLE = ['APPROVED', 'SENT', 'PARTIAL_RECEIVED'];
    if (!RECEIVABLE.includes(po.status)) {
      return reply.code(422).send({ error: 'Solo se puede dar ingreso a órdenes aprobadas' });
    }
    if (!po.lines.length) return reply.code(400).send({ error: 'La OC no tiene líneas' });

    // Index any per-line overrides sent by the UI (qty / cost / lote / vencimiento).
    const overrides = new Map((body.lines ?? []).map(l => [l.lineId, l]));
    const rate = Number(po.exchangeRate) || 1;

    // Build the effective receipt for each line (defaulting qty to the remaining
    // amount and unit cost to the OC price converted to soles), skipping lines
    // that have nothing left to receive.
    const toReceive = po.lines
      .map(line => {
        const ov        = overrides.get(line.id) ?? ({} as any);
        const remaining = Number(line.qtyOrdered) - Number(line.qtyReceived);
        const qty       = ov.qtyReceived != null ? Number(ov.qtyReceived) : remaining;
        const unitCost  = ov.unitCostPen != null ? Number(ov.unitCostPen) : Number(line.unitPrice) * rate;
        return { line, ov, qty, unitCost };
      })
      .filter(x => x.qty > 0);

    if (!toReceive.length) return reply.code(400).send({ error: 'No hay cantidades por recibir' });

    // Create the GoodsReceiptNote first so every receipt line can hang off it.
    const grn = await prisma.goodsReceiptNote.create({
      data: {
        grnNumber:       `GRN-${Date.now()}`,
        purchaseOrderId: po.id,
        receivedDate:    body.receivedDate ? new Date(body.receivedDate) : new Date(),
        warehouseId:     body.warehouseId,
        receivedBy:      req.actor!.sub,
        notes:           body.notes || null,
      },
    });

    for (const { line, ov, qty, unitCost } of toReceive) {
      // Convert the received quantity to the ingredient's master unit (baseUom)
      // when the purchase unit differs (e.g. bought in "g" but stocked in "kg").
      // The unit cost is scaled inversely so the line's total value is preserved.
      // When the units aren't convertible (e.g. "saco", "caja") the quantity is
      // left untouched.
      const baseUom = line.ingredient?.baseUom ?? line.uom;
      // Resolver first (knows per-ingredient presentations like 1 saco = 50 kg),
      // with the dimensional table (kg↔g, l↔ml) underneath.
      const conv = await resolveConvertQty(qty, line.uom, baseUom, line.ingredientId);
      const stockQty      = conv.qty;
      const stockUnitCost = conv.converted ? unitCost / conv.factor : unitCost;
      const convNote = conv.converted
        ? `Conversión: ${qty} ${line.uom} → ${stockQty} ${baseUom}`
        : null;

      const { batchId } = await registerReceipt({
        ingredientId:   line.ingredientId,
        warehouseId:    body.warehouseId,
        qty:            stockQty,
        unitCost:       stockUnitCost,
        poRef:          po.poNumber,
        lotNumber:      ov.lotNumber || undefined,
        expiryDate:     ov.expiryDate || undefined,
        productionDate: ov.productionDate || undefined,
        notes:          convNote || undefined,
        createdBy:      req.actor!.sub,
      });

      await prisma.goodsReceiptLine.create({
        data: {
          grnId:               grn.id,
          purchaseOrderLineId: line.id,
          ingredientId:        line.ingredientId,
          qtyReceived:         qty,
          batchId:             batchId ?? null,
          unitCostPen:         unitCost,
          notes:               [ov.lotNumber ? `Lote: ${ov.lotNumber}` : null, convNote].filter(Boolean).join(' · ') || null,
        },
      });

      await prisma.purchaseOrderLine.update({
        where: { id: line.id },
        data:  { qtyReceived: { increment: qty } },
      });
    }

    // Recompute status: fully received only when every line is fully covered.
    const refreshed = await prisma.purchaseOrderLine.findMany({ where: { purchaseOrderId: po.id } });
    const fully = refreshed.every(l => Number(l.qtyReceived) >= Number(l.qtyOrdered));
    const updated = await prisma.purchaseOrder.update({
      where: { id: po.id },
      data:  { status: fully ? 'FULLY_RECEIVED' : 'PARTIAL_RECEIVED' },
      include: { lines: { include: { ingredient: true } }, supplier: true },
    });

    return reply.code(201).send({ data: updated, grnNumber: grn.grnNumber });
  });

  // ── PATCH /purchase-orders/:id — edit a DRAFT order (supplier, lines, currency) ─
  app.patch('/purchase-orders/:id', { preHandler: [requireAnyOf('PROCUREMENT', 'OPS_MGR')] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as {
      supplierId?: string;
      currency?: string;
      exchangeRate?: number;
      expectedDeliveryDate?: string | null;
      notes?: string | null;
      lines?: { ingredientId: string; qtyOrdered?: number; quantity?: number; uom?: string; unitPrice?: number; unitPricePen?: number }[];
    };

    const existing = await prisma.purchaseOrder.findUnique({ where: { id } });
    if (!existing) return reply.code(404).send({ error: 'OC no encontrada' });
    if (existing.status !== 'DRAFT') {
      return reply.code(422).send({ error: 'Solo se pueden editar órdenes en borrador' });
    }

    const currency = (body.currency || existing.currency || 'PEN').toUpperCase();
    const rate = currency === 'PEN' ? 1 : (Number(body.exchangeRate) || Number(existing.exchangeRate) || 1);

    const data: any = {
      ...(body.supplierId ? { supplierId: body.supplierId } : {}),
      currency,
      exchangeRate: rate,
      ...(body.expectedDeliveryDate !== undefined
        ? { expectedDeliveryDate: body.expectedDeliveryDate ? new Date(body.expectedDeliveryDate) : null }
        : {}),
      ...(body.notes !== undefined ? { notes: body.notes } : {}),
    };

    // Replace lines atomically when provided, and recompute soles totals.
    if (body.lines) {
      const lines = body.lines
        .filter(l => l.ingredientId)
        .map(l => {
          const qty   = Number(l.qtyOrdered ?? l.quantity ?? 0) || 0;
          const price = Number(l.unitPrice ?? l.unitPricePen ?? 0) || 0;
          return {
            ingredientId: l.ingredientId,
            qtyOrdered:   qty,
            uom:          l.uom || 'unidad',
            unitPrice:    price,
            lineTotalPen: parseFloat((qty * price * rate).toFixed(4)),
          };
        });
      if (lines.length === 0) return reply.code(400).send({ error: 'La OC debe tener al menos una línea' });
      const linesWithBase = await withBaseUnits(lines);
      const subtotal = lines.reduce((s, l) => s + l.lineTotalPen, 0);
      const igv = parseFloat((subtotal * 0.18).toFixed(4));
      data.subtotalPen = subtotal;
      data.igvPen = igv;
      data.totalPen = parseFloat((subtotal + igv).toFixed(4));
      await prisma.purchaseOrderLine.deleteMany({ where: { purchaseOrderId: id } });
      data.lines = { create: linesWithBase };
    }

    const po = await prisma.purchaseOrder.update({
      where: { id },
      data,
      include: { lines: { include: { ingredient: true } }, supplier: true },
    });
    return reply.send({ data: po });
  });


  // ══════════════════════════════════════════════════════════════════════════
  //  Adjuntos de la OC — factura, certificado de calidad, cotización
  // ══════════════════════════════════════════════════════════════════════════
  //
  // Uploading a *factura* also creates the matching Comprobante (linked to this
  // OC), so the document lands in Control de pagos without being registered
  // twice. Uploading a *certificado de calidad* runs the lot/expiry reader, and
  // the result is what pre-fills the stock-entry form — see
  // GET /purchase-orders/:id/receive-suggestion.
  //
  // Payload is base64 JSON, matching the Comprobantes module. @fastify/multipart
  // is registered but no route in this codebase consumes it.

  const ATTACHMENT_LIST_SELECT = {
    id: true, purchaseOrderId: true, kind: true, nombreArchivo: true,
    mimeType: true, tamanoBytes: true, numero: true, fechaEmision: true,
    emisorRuc: true, total: true, lotesDetected: true, comprobanteId: true,
    createdAt: true, createdBy: true,
  } as const;

  app.get('/purchase-orders/:id/attachments', {
    preHandler: [requireAnyOf('PROCUREMENT', 'OPS_MGR', 'FINANCE_MGR', 'WAREHOUSE')],
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const data = await prisma.purchaseOrderAttachment.findMany({
      where: { purchaseOrderId: id },
      select: ATTACHMENT_LIST_SELECT,
      orderBy: { createdAt: 'desc' },
    });
    return reply.send({ data });
  });

  app.post('/purchase-orders/:id/attachments', {
    preHandler: [requireAnyOf('PROCUREMENT', 'OPS_MGR', 'FINANCE_MGR', 'WAREHOUSE')],
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as {
      kind?: 'FACTURA' | 'CERTIFICADO_CALIDAD' | 'COTIZACION' | 'GUIA_REMISION' | 'OTRO';
      nombreArchivo?: string;
      mimeType?: string;
      dataBase64?: string;
      tamanoBytes?: number;
      /// Set false to skip creating a Comprobante for a factura.
      registrarComprobante?: boolean;
    };

    if (!body.nombreArchivo || !body.mimeType || !body.dataBase64) {
      return reply.code(400).send({ error: 'nombreArchivo, mimeType y dataBase64 son requeridos' });
    }

    const po = await prisma.purchaseOrder.findUnique({
      where: { id },
      select: { id: true, poNumber: true, supplierId: true, currency: true, totalPen: true },
    });
    if (!po) return reply.code(404).send({ error: 'OC no encontrada' });

    const kind  = body.kind ?? 'OTRO';
    const bytes = body.tamanoBytes ?? Math.round((body.dataBase64.length * 3) / 4);

    // Read the document once, according to what it is.
    let header: Awaited<ReturnType<typeof autoExtract>> = {};
    let lotes: DetectedLot[] = [];
    if (kind === 'CERTIFICADO_CALIDAD') {
      lotes = await extractLotsFromAttachment(body.mimeType, body.dataBase64);
    } else {
      header = await autoExtract(body.mimeType, body.dataBase64);
    }

    // A factura also becomes a Comprobante so Control de pagos sees it.
    let comprobanteId: string | null = null;
    if (kind === 'FACTURA' && body.registrarComprobante !== false) {
      const comprobante = await prisma.comprobante.create({
        data: {
          tipoDoc:         'FACTURA',
          descripcion:     `Factura ${header.numero ?? ''} · ${po.poNumber}`.trim(),
          fecha:           header.fechaEmision ?? new Date(),
          moneda:          header.monedaDoc ?? po.currency ?? 'PEN',
          montoTotal:      header.total ?? null,
          purchaseOrderId: po.id,
          proveedorId:     po.supplierId,
          source:          'MANUAL',
          estado:          'PENDIENTE',
          createdBy:       req.actor!.sub,
          archivos: {
            create: {
              docType:       'FACTURA',
              archivoTipo:   archivoTipoFromMime(body.mimeType),
              nombreArchivo: body.nombreArchivo,
              mimeType:      body.mimeType,
              dataBase64:    body.dataBase64,
              tamanoBytes:   bytes,
              ...header,
            } as never,
          },
        } as never,
        select: { id: true },
      });
      comprobanteId = comprobante.id;
    }

    const created = await prisma.purchaseOrderAttachment.create({
      data: {
        purchaseOrderId: po.id,
        kind:            kind as never,
        nombreArchivo:   body.nombreArchivo,
        mimeType:        body.mimeType,
        tamanoBytes:     bytes,
        dataBase64:      body.dataBase64,
        numero:          header.numero ?? null,
        fechaEmision:    header.fechaEmision ?? null,
        emisorRuc:       header.emisorRuc ?? null,
        total:           header.total ?? null,
        lotesDetected:   lotes.length ? (lotes as never) : undefined,
        comprobanteId,
        createdBy:       req.actor!.sub,
      },
      select: ATTACHMENT_LIST_SELECT,
    });

    return reply.code(201).send({ data: created, lotesDetectados: lotes.length });
  });

  // Base64 payload on demand — kept out of the list response so the OC screen
  // doesn't download every PDF it shows.
  app.get('/purchase-orders/attachments/:attId/data', {
    preHandler: [requireAnyOf('PROCUREMENT', 'OPS_MGR', 'FINANCE_MGR', 'WAREHOUSE')],
  }, async (req, reply) => {
    const { attId } = req.params as { attId: string };
    const att = await prisma.purchaseOrderAttachment.findUnique({ where: { id: attId } });
    if (!att) return reply.code(404).send({ error: 'Adjunto no encontrado' });
    return reply.send({
      data: {
        id: att.id, nombreArchivo: att.nombreArchivo, mimeType: att.mimeType,
        dataBase64: att.dataBase64,
      },
    });
  });

  app.delete('/purchase-orders/attachments/:attId', {
    preHandler: [requireAnyOf('PROCUREMENT', 'OPS_MGR', 'FINANCE_MGR')],
  }, async (req, reply) => {
    const { attId } = req.params as { attId: string };
    const att = await prisma.purchaseOrderAttachment.findUnique({ where: { id: attId } });
    if (!att) return reply.code(404).send({ error: 'Adjunto no encontrado' });
    // The Comprobante is deliberately left alone: it may already be reconciled
    // or paid. Deleting the OC attachment only removes the copy on the OC.
    await prisma.purchaseOrderAttachment.delete({ where: { id: attId } });
    return reply.send({ ok: true, comprobanteId: att.comprobanteId });
  });

  // ── GET /purchase-orders/:id/receive-suggestion ─────────────────────────────
  // What the stock-entry form should open with: pending quantity per line plus
  // the lote / vencimiento read off the certificados de calidad attached to this
  // OC. Nothing here moves stock — the operator confirms in the receive modal.
  app.get('/purchase-orders/:id/receive-suggestion', {
    preHandler: [requireAnyOf('WAREHOUSE', 'OPS_MGR', 'PROCUREMENT', 'SUPER_ADMIN')],
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const po = await prisma.purchaseOrder.findUnique({
      where: { id },
      include: { lines: { include: { ingredient: { select: { id: true, name: true, baseUom: true, isPerishable: true } } } } },
    });
    if (!po) return reply.code(404).send({ error: 'OC no encontrada' });

    const certs = await prisma.purchaseOrderAttachment.findMany({
      where: { purchaseOrderId: id, kind: 'CERTIFICADO_CALIDAD' },
      select: { id: true, nombreArchivo: true, lotesDetected: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
    const detected: DetectedLot[] = certs.flatMap(c => (c.lotesDetected as DetectedLot[] | null) ?? []);

    // Matching, in order of confidence:
    //  1. the ingredient's name appears in the certificate row it came from
    //  2. exactly one lot in the whole OC → it belongs to every line
    //  3. one lot per line, in document order
    // Anything else is left blank rather than guessed.
    const lines = po.lines.map((line, idx) => {
      const remaining = Number(line.qtyOrdered) - Number(line.qtyReceived);
      const name = (line.ingredient?.name ?? '').toLowerCase();
      const firstWord = name.split(/\s+/)[0] ?? '';

      let hit: DetectedLot | undefined;
      let matchedBy: 'nombre' | 'unico' | 'orden' | null = null;

      if (firstWord.length >= 4) {
        hit = detected.find(d => (d.rawLine ?? '').toLowerCase().includes(firstWord));
        if (hit) matchedBy = 'nombre';
      }
      if (!hit && detected.length === 1) { hit = detected[0]; matchedBy = 'unico'; }
      if (!hit && detected.length === po.lines.length) { hit = detected[idx]; matchedBy = 'orden'; }

      return {
        lineId:         line.id,
        ingredientId:   line.ingredientId,
        ingredientName: line.ingredient?.name ?? null,
        uom:            line.uom,
        baseUom:        line.ingredient?.baseUom ?? null,
        isPerishable:   !!line.ingredient?.isPerishable,
        qtySuggested:   remaining > 0 ? remaining : 0,
        qtyBase:        line.qtyBase != null ? Number(line.qtyBase) : null,
        lotNumber:      hit?.lotNumber ?? null,
        expiryDate:     hit?.expiryDate ?? null,
        productionDate: hit?.productionDate ?? null,
        matchedBy,
      };
    });

    return reply.send({
      data: {
        purchaseOrderId: po.id,
        certificados: certs.map(c => ({ id: c.id, nombreArchivo: c.nombreArchivo, lotes: ((c.lotesDetected as DetectedLot[] | null) ?? []).length })),
        lines,
      },
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  //  Presentaciones (uom_conversions) — "1 saco = 50 kg"
  // ══════════════════════════════════════════════════════════════════════════
  // Per-ingredient when ingredientId is set, universal when it's null. These
  // feed both the OC (qtyBase on each line) and the stock entry.

  app.get('/uom-conversions', {
    preHandler: [requireAnyOf('PROCUREMENT', 'OPS_MGR', 'WAREHOUSE', 'FINANCE_MGR')],
  }, async (req, reply) => {
    const q = req.query as { ingredientId?: string };
    const rows = await prisma.uOMConversion.findMany({
      where: q.ingredientId ? { OR: [{ ingredientId: q.ingredientId }, { ingredientId: null }] } : {},
      orderBy: [{ fromUom: 'asc' }, { toUom: 'asc' }],
    });
    const ids  = rows.map(r => r.ingredientId).filter(Boolean) as string[];
    const ings = ids.length
      ? await prisma.ingredient.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })
      : [];
    const nameById = new Map(ings.map(i => [i.id, i.name]));
    return reply.send({
      data: rows.map(r => ({ ...r, factor: Number(r.factor), ingredientName: r.ingredientId ? nameById.get(r.ingredientId) ?? null : null })),
    });
  });

  app.post('/uom-conversions', { preHandler: [requireAnyOf('PROCUREMENT', 'OPS_MGR')] }, async (req, reply) => {
    const b = (req.body ?? {}) as { fromUom?: string; toUom?: string; factor?: number | string; ingredientId?: string | null };
    const fromUom = (b.fromUom ?? '').toString().toLowerCase().trim();
    const toUom   = (b.toUom   ?? '').toString().toLowerCase().trim();
    const factor  = Number(b.factor);

    if (!fromUom || !toUom)          return reply.code(400).send({ error: 'fromUom y toUom son requeridos' });
    if (fromUom === toUom)           return reply.code(400).send({ error: 'Las unidades deben ser distintas' });
    if (!Number.isFinite(factor) || factor <= 0) return reply.code(400).send({ error: 'El factor debe ser mayor a 0' });

    const row = await prisma.uOMConversion.upsert({
      where:  { fromUom_toUom_ingredientId: { fromUom, toUom, ingredientId: (b.ingredientId ?? null) as never } },
      update: { factor },
      create: { fromUom, toUom, factor, ingredientId: b.ingredientId || null },
    });
    return reply.code(201).send({ data: { ...row, factor: Number(row.factor) } });
  });

  app.delete('/uom-conversions/:convId', { preHandler: [requireAnyOf('PROCUREMENT', 'OPS_MGR')] }, async (req, reply) => {
    const { convId } = req.params as { convId: string };
    await prisma.uOMConversion.delete({ where: { id: convId } }).catch(() => null);
    return reply.send({ ok: true });
  });

  app.get('/suppliers', { preHandler: [requireAnyOf('PROCUREMENT', 'OPS_MGR', 'FINANCE_MGR')] }, async (_req, reply) => {
    const suppliers = await prisma.supplier.findMany({ where: { isActive: true }, orderBy: { businessName: 'asc' } });
    return reply.send({ data: suppliers });
  });

  app.post('/suppliers', { preHandler: [requireAnyOf('PROCUREMENT')] }, async (req, reply) => {
    const body = req.body as any;
    if (!body?.businessName || !body?.ruc) {
      return reply.code(400).send({ error: 'Razón social y RUC son requeridos' });
    }
    const supplier = await prisma.supplier.create({ data: normalizeSupplierBody(body) });
    return reply.code(201).send({ data: supplier });
  });

  app.patch('/suppliers/:id', { preHandler: [requireAnyOf('PROCUREMENT', 'OPS_MGR', 'SUPER_ADMIN')] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    // Never change the RUC on edit (unique identity); drop it from the update.
    const { ruc: _ruc, ...rest } = normalizeSupplierBody(req.body as any);
    const supplier = await prisma.supplier.update({ where: { id }, data: rest });
    return reply.send({ data: supplier });
  });
}
