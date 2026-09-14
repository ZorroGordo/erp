// ─────────────────────────────────────────────────────────────────────────────
//  VictorOS ERP — Comprobantes (Document Registry)
//  Stores and retrieves all sustento documents: facturas, boletas, OC, guías, etc.
//  Supports PDF / imagen / XML files with automatic field extraction.
//  Peruvian SUNAT / PCGE standards.
// ─────────────────────────────────────────────────────────────────────────────

import type { FastifyInstance } from 'fastify';
import { PrismaClient } from '@prisma/client';
import type {
  ComprobanteDocType,
  ComprobanteArchivoTipo,
  ComprobanteEstado,
} from '@prisma/client';
import { requireAnyOf } from '../../middleware/auth';
import {
  type ExtractedDoc,
  autoExtract,
  archivoTipoFromMime,
  guessDocTypeFromFilename as _guessDocTypeFromFilename,
} from './extractor';

const prisma = new PrismaClient();

// ─────────────────────────────────────────────────────────────────────────────
//  Routes
// ─────────────────────────────────────────────────────────────────────────────
export async function comprobantesRoutes(app: FastifyInstance) {

  // ── LIST ──────────────────────────────────────────────────────────────────
  app.get('/', { preHandler: [requireAnyOf('FINANCE_MGR', 'ACCOUNTANT', 'OPS_MGR', 'PROCUREMENT')] },
    async (req, reply) => {
      const {
        page = '1', limit = '30',
        estado, docType, search,
        fechaDesde, fechaHasta,
        purchaseOrderId, source,
        moneda, fechaPago, glosa, proveedorId,
      } = req.query as Record<string, string>;

      const skip  = (parseInt(page) - 1) * parseInt(limit);
      const take  = Math.min(parseInt(limit), 100);

      const where: any = {};
      if (estado)          where.estado = estado as ComprobanteEstado;
      if (source)          where.source = source;
      if (moneda)          where.moneda = moneda;
      // The payment filter works off fechaVencimiento (when it's due) and only
      // looks at documents that aren't settled yet — a paid invoice is never
      // "vencida". fechaPago now means "paid on".
      if (fechaPago) {
        const today = new Date();
        if (fechaPago === 'vencida') {
          where.fechaVencimiento = { lt: today };
          where.fechaPago = null;
        } else if (fechaPago === 'proxima') {
          where.fechaVencimiento = { gte: today, lte: new Date(Date.now() + 7 * 86400_000) };
          where.fechaPago = null;
        } else if (fechaPago === 'sin_fecha') {
          where.fechaVencimiento = null;
        } else if (fechaPago === 'pagada') {
          where.fechaPago = { not: null };
        } else if (fechaPago === 'pendiente') {
          where.fechaPago = null;
        }
      }
      if (glosa) where.glosa = glosa;
      if (proveedorId) where.proveedorId = proveedorId;
      if (purchaseOrderId) where.purchaseOrderId = purchaseOrderId;
      if (fechaDesde || fechaHasta) {
        where.fecha = {};
        if (fechaDesde) where.fecha.gte = new Date(fechaDesde);
        if (fechaHasta) where.fecha.lte = new Date(fechaHasta + 'T23:59:59');
      }
      if (docType) {
        where.archivos = { some: { docType: docType as ComprobanteDocType } };
      }
      if (search) {
        where.OR = [
          { descripcion: { contains: search, mode: 'insensitive' } },
          { archivos: { some: { emisorNombre: { contains: search, mode: 'insensitive' } } } },
          { archivos: { some: { numero: { contains: search, mode: 'insensitive' } } } },
          { archivos: { some: { emisorRuc: { contains: search, mode: 'insensitive' } } } },
        ];
      }

      const [items, total] = await prisma.$transaction([
        prisma.comprobante.findMany({
          where,
          skip,
          take,
          orderBy: { fecha: 'desc' },
          include: {
            archivos: {
              select: {
                id: true, docType: true, archivoTipo: true, nombreArchivo: true,
                serie: true, correlativo: true, numero: true,
                fechaEmision: true, emisorRuc: true, emisorNombre: true,
                receptorRuc: true, receptorNombre: true,
                monedaDoc: true, subtotal: true, igv: true, total: true,
                mimeType: true, tamanoBytes: true, createdAt: true,
                // dataBase64 intentionally excluded — fetched on demand
              },
            },
            purchaseOrder: { select: { id: true, poNumber: true, supplier: { select: { businessName: true } } } },
            proveedor:     { select: { id: true, businessName: true, ruc: true } },
            pagos:         { select: { id: true, fechaPago: true, monto: true, medio: true, referencia: true, nombreArchivo: true } },
          },
        }),
        prisma.comprobante.count({ where }),
      ]);

      return reply.send({ data: items, meta: { total, page: parseInt(page), limit: take } });
    }
  );

  // ── GET SINGLE ────────────────────────────────────────────────────────────
  app.get('/:id', { preHandler: [requireAnyOf('FINANCE_MGR', 'ACCOUNTANT', 'OPS_MGR', 'PROCUREMENT')] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const item = await prisma.comprobante.findUnique({
        where: { id },
        include: {
          archivos: {
            select: {
              id: true, docType: true, archivoTipo: true, nombreArchivo: true,
              serie: true, correlativo: true, numero: true,
              fechaEmision: true, emisorRuc: true, emisorNombre: true,
              receptorRuc: true, receptorNombre: true,
              monedaDoc: true, subtotal: true, igv: true, total: true,
              mimeType: true, tamanoBytes: true, createdAt: true,
            },
          },
          purchaseOrder: { select: { id: true, poNumber: true, supplier: { select: { businessName: true, ruc: true } } } },
          invoice:        { select: { id: true, docType: true, series: true, correlative: true, entityName: true } },
          proveedor:      { select: { id: true, businessName: true, ruc: true } },
          pagos:          { orderBy: { fechaPago: 'asc' },
                            select: { id: true, fechaPago: true, monto: true, moneda: true, medio: true,
                                      referencia: true, notas: true, nombreArchivo: true, mimeType: true,
                                      tamanoBytes: true, createdAt: true } },
        },
      });
      if (!item) return reply.code(404).send({ error: 'NOT_FOUND' });
      return reply.send({ data: item });
    }
  );

  // ── GET ARCHIVO DATA (base64) ─────────────────────────────────────────────
  app.get('/archivos/:archivoId/data', { preHandler: [requireAnyOf('FINANCE_MGR', 'ACCOUNTANT', 'OPS_MGR', 'PROCUREMENT')] },
    async (req, reply) => {
      const { archivoId } = req.params as { archivoId: string };
      const archivo = await prisma.comprobanteArchivo.findUnique({
        where: { id: archivoId },
        select: { id: true, dataBase64: true, mimeType: true, nombreArchivo: true },
      });
      if (!archivo) return reply.code(404).send({ error: 'NOT_FOUND' });
      return reply.send({ data: archivo });
    }
  );

  // ── CREATE COMPROBANTE ────────────────────────────────────────────────────
  app.post('/', { preHandler: [requireAnyOf('FINANCE_MGR', 'ACCOUNTANT', 'OPS_MGR', 'PROCUREMENT')] },
    async (req, reply) => {
      const user = (req as any).user as { sub: string };
      const {
        descripcion, fecha, moneda = 'PEN', montoTotal,
        purchaseOrderId, invoiceId, consolidacionRef,
        estado, notas, tags,
        glosa, fechaVencimiento, proveedorId,
        // optional first archivo inline
        archivo,
      } = req.body as {
        descripcion: string;
        fecha: string;
        moneda?: string;
        montoTotal?: number;
        purchaseOrderId?: string;
        invoiceId?: string;
        consolidacionRef?: string;
        estado?: ComprobanteEstado;
        notas?: string;
        tags?: string[];
        glosa?: string;
        fechaVencimiento?: string;
        proveedorId?: string;
        archivo?: {
          docType: ComprobanteDocType;
          nombreArchivo: string;
          mimeType: string;
          dataBase64: string;
          tamanoBytes: number;
        };
      };

      if (!descripcion) return reply.code(400).send({ error: 'descripcion requerida' });
      if (!fecha)       return reply.code(400).send({ error: 'fecha requerida' });

      let archivoData: Omit<typeof prisma.comprobanteArchivo.create['arguments']['data'], 'comprobanteId'> | undefined;

      if (archivo) {
        const extracted = await autoExtract(archivo.mimeType, archivo.dataBase64);
        archivoData = {
          docType:       archivo.docType,
          archivoTipo:   archivoTipoFromMime(archivo.mimeType),
          nombreArchivo: archivo.nombreArchivo,
          mimeType:      archivo.mimeType,
          dataBase64:    archivo.dataBase64,
          tamanoBytes:   archivo.tamanoBytes,
          ...extracted,
        } as any;
      }

      // Propagate extracted fields to parent if not manually provided
      const extracted0 = archivoData as any;
      const resolvedFecha    = new Date(fecha);
      const resolvedMoneda   = moneda !== 'PEN' ? moneda : (extracted0?.monedaDoc ?? moneda);
      const resolvedMonto    = montoTotal != null ? montoTotal : (extracted0?.total ?? null);

      // Due date: explicit value wins; otherwise derive it from the supplier's
      // payment terms so "controlar la fecha de vencimiento" works without
      // someone typing a date on every invoice.
      let resolvedVencimiento: Date | null = fechaVencimiento ? new Date(fechaVencimiento) : null;
      if (!resolvedVencimiento && proveedorId) {
        const prov = await prisma.supplier.findUnique({
          where: { id: proveedorId }, select: { paymentTermsDays: true },
        });
        const days = prov?.paymentTermsDays ?? null;
        if (days != null) {
          const base = extracted0?.fechaEmision ?? resolvedFecha;
          resolvedVencimiento = new Date(new Date(base).getTime() + Number(days) * 86400_000);
        }
      }

      const comprobante = await prisma.comprobante.create({
        data: {
          descripcion,
          fecha:           extracted0?.fechaEmision ?? resolvedFecha,
          moneda:          resolvedMoneda,
          montoTotal:      resolvedMonto,
          purchaseOrderId: purchaseOrderId ?? null,
          invoiceId:       invoiceId       ?? null,
          consolidacionRef: consolidacionRef ?? null,
          proveedorId:     proveedorId     ?? null,
          glosa:           glosa           ?? null,
          fechaVencimiento: resolvedVencimiento,
          estado:          estado ?? 'PENDIENTE',
          notas:           notas  ?? null,
          tags:            tags   ?? [],
          createdBy:       user.sub,
          archivos:        archivoData ? { create: archivoData } : undefined,
        } as any,
        include: { archivos: { select: { id: true, docType: true, archivoTipo: true, numero: true, emisorNombre: true, total: true } } },
      });

      return reply.code(201).send({ data: comprobante });
    }
  );

  // ── UPDATE COMPROBANTE ────────────────────────────────────────────────────
  app.patch('/:id', { preHandler: [requireAnyOf('FINANCE_MGR', 'ACCOUNTANT', 'OPS_MGR', 'PROCUREMENT')] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const body   = req.body as Record<string, unknown>;
      const allowed = ['descripcion','fecha','moneda','montoTotal','fechaPago','fechaVencimiento','glosa','proveedorId','purchaseOrderId','invoiceId','consolidacionRef','estado','notas','tags'];
      const data: Record<string, unknown> = {};
      for (const k of allowed) if (k in body) {
        if (k === 'fecha' || k === 'fechaPago' || k === 'fechaVencimiento') {
          data[k] = body[k] ? new Date(body[k] as string) : null;
        } else {
          data[k] = body[k];
        }
      }

      const updated = await prisma.comprobante.update({ where: { id }, data });
      return reply.send({ data: updated });
    }
  );

  // ── DELETE COMPROBANTE ────────────────────────────────────────────────────
  app.delete('/:id', { preHandler: [requireAnyOf('FINANCE_MGR', 'ACCOUNTANT')] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      await prisma.comprobante.delete({ where: { id } });
      return reply.code(204).send();
    }
  );

  // ── ADD ARCHIVO ───────────────────────────────────────────────────────────
  app.post('/:id/archivos', { preHandler: [requireAnyOf('FINANCE_MGR', 'ACCOUNTANT', 'OPS_MGR', 'PROCUREMENT')] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const {
        docType, nombreArchivo, mimeType, dataBase64, tamanoBytes,
      } = req.body as {
        docType: ComprobanteDocType;
        nombreArchivo: string;
        mimeType: string;
        dataBase64: string;
        tamanoBytes: number;
      };

      if (!docType || !dataBase64) return reply.code(400).send({ error: 'docType y dataBase64 requeridos' });

      // Verify parent exists
      const parent = await prisma.comprobante.findUnique({ where: { id }, select: { id: true } });
      if (!parent) return reply.code(404).send({ error: 'Comprobante no encontrado' });

      const extracted = await autoExtract(mimeType, dataBase64);

      const archivo = await prisma.comprobanteArchivo.create({
        data: {
          comprobanteId: id,
          docType,
          archivoTipo:   archivoTipoFromMime(mimeType),
          nombreArchivo,
          mimeType,
          dataBase64,
          tamanoBytes,
          ...extracted,
        } as any,
        select: {
          id: true, docType: true, archivoTipo: true, nombreArchivo: true,
          serie: true, correlativo: true, numero: true,
          fechaEmision: true, emisorRuc: true, emisorNombre: true,
          receptorRuc: true, receptorNombre: true,
          monedaDoc: true, subtotal: true, igv: true, total: true,
          mimeType: true, tamanoBytes: true, createdAt: true,
        },
      });

      // Optionally update parent montoTotal from first complete total found
      if ((extracted as any).total) {
        await prisma.comprobante.update({
          where: { id },
          data: { montoTotal: (extracted as any).total },
        }).catch(() => {/* ignore if already set */});
      }

      return reply.code(201).send({ data: archivo });
    }
  );

  // ── REMOVE ARCHIVO ────────────────────────────────────────────────────────
  app.delete('/:id/archivos/:archivoId', { preHandler: [requireAnyOf('FINANCE_MGR', 'ACCOUNTANT')] },
    async (req, reply) => {
      const { archivoId } = req.params as { id: string; archivoId: string };
      await prisma.comprobanteArchivo.delete({ where: { id: archivoId } });
      return reply.code(204).send();
    }
  );

  // ── RE-EXTRACT ───────────────────────────────────────────────────────────────────────
  app.post('/:id/re-extract', { preHandler: [requireAnyOf('FINANCE_MGR', 'ACCOUNTANT', 'OPS_MGR', 'PROCUREMENT')] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const parent = await prisma.comprobante.findUnique({ where: { id }, select: { id: true } });
      if (!parent) return reply.code(404).send({ error: 'NOT_FOUND' });
      const archivos = await prisma.comprobanteArchivo.findMany({
        where: { comprobanteId: id },
        select: { id: true, mimeType: true, dataBase64: true },
      });
      let bestDate: Date | undefined;
      let bestTotal: number | undefined;
      let bestMoneda: string | undefined;
      for (const arch of archivos) {
        try {
          const extracted = await autoExtract(arch.mimeType, arch.dataBase64);
          if (Object.keys(extracted).length > 0) {
            await prisma.comprobanteArchivo.update({ where: { id: arch.id }, data: extracted as any });
          }
          if (extracted.fechaEmision && !bestDate)   bestDate  = extracted.fechaEmision;
          if (extracted.total        && !bestTotal)  bestTotal = Number(extracted.total);
          if (extracted.monedaDoc    && !bestMoneda) bestMoneda = extracted.monedaDoc;
        } catch { /* best-effort */ }
      }
      const updates: Record<string, unknown> = {};
      if (bestDate)   updates.fecha     = bestDate;
      if (bestTotal)  updates.montoTotal = bestTotal;
      if (bestMoneda) updates.moneda     = bestMoneda;
      if (Object.keys(updates).length > 0) {
        await prisma.comprobante.update({ where: { id }, data: updates });
      }
      const updated = await prisma.comprobante.findUnique({
        where: { id },
        include: {
          archivos: {
            select: {
              id: true, docType: true, archivoTipo: true, nombreArchivo: true,
              serie: true, correlativo: true, numero: true,
              fechaEmision: true, emisorRuc: true, emisorNombre: true,
              receptorRuc: true, receptorNombre: true,
              monedaDoc: true, subtotal: true, igv: true, total: true,
              mimeType: true, tamanoBytes: true, createdAt: true,
            },
          },
          proveedor: { select: { id: true, businessName: true, ruc: true } },
        },
      });
      return reply.send({ data: updated });
    }
  );

  // ── TEST ENDPOINT (JSON) — easy testing without Mailgun ───────────────────
  // POST /v1/comprobantes/email-ingest/test  { sender, subject, attachments: [{ filename, mimeType, dataBase64 }] }
  app.post('/email-ingest/test', { preHandler: [requireAnyOf('FINANCE_MGR', 'ACCOUNTANT', 'OPS_MGR', 'SUPER_ADMIN')] },
    async (req, reply) => {
      const body = req.body as {
        sender?: string;
        subject?: string;
        attachments?: Array<{ filename: string; mimeType: string; dataBase64: string }>;
      };

      const sender  = body.sender  ?? 'test@test.com';
      const subject = body.subject ?? 'Test desde email';
      const atts    = body.attachments ?? [];

      if (atts.length === 0) {
        return reply.code(400).send({ error: 'NO_ATTACHMENTS' });
      }

      const comprobante = await prisma.comprobante.create({
        data: {
          descripcion:  subject,
          fecha:        new Date(),
          moneda:       'PEN',
          source:       'EMAIL' as any,
          senderEmail:  sender,
          emailSubject: subject,
          createdBy:    sender,
          archivos: {
            create: atts.map((att) => ({
              docType:      guessDocTypeFromFilename(att.filename),
              archivoTipo:  mimeToArchivoTipo(att.mimeType),
              nombreArchivo: att.filename,
              mimeType:     att.mimeType,
              tamanoBytes:  Buffer.from(att.dataBase64, 'base64').length,
              dataBase64:   att.dataBase64,
            })),
          },
        },
      });

      return reply.code(201).send({ data: { id: comprobante.id } });
    }
  );

  // ── SUMMARY STATS ─────────────────────────────────────────────────────────

  // ══════════════════════════════════════════════════════════════════════════
  //  CONTROL DE PAGOS — pagos con voucher, glosas y reporte
  // ══════════════════════════════════════════════════════════════════════════

  // ── LIST PAGOS ────────────────────────────────────────────────────────────
  app.get('/:id/pagos', { preHandler: [requireAnyOf('FINANCE_MGR', 'ACCOUNTANT', 'OPS_MGR', 'PROCUREMENT')] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const pagos = await prisma.comprobantePago.findMany({
        where: { comprobanteId: id },
        orderBy: { fechaPago: 'asc' },
        select: {
          id: true, fechaPago: true, monto: true, moneda: true, medio: true,
          referencia: true, notas: true, nombreArchivo: true, mimeType: true,
          tamanoBytes: true, createdAt: true, createdBy: true,
        },
      });
      return reply.send({ data: pagos });
    }
  );

  // ── REGISTRAR PAGO (con voucher) ──────────────────────────────────────────
  // Records a payment against a received invoice and attaches its voucher. When
  // the payments cover the document's total, Comprobante.fechaPago is set to the
  // last payment date — that, not a manually typed date, is what "cancelada"
  // means from here on.
  app.post('/:id/pagos', { preHandler: [requireAnyOf('FINANCE_MGR', 'ACCOUNTANT', 'OPS_MGR')] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const user = (req as any).user as { sub: string };
      const b = (req.body ?? {}) as {
        fechaPago?: string; monto?: number | string; moneda?: string;
        medio?: string; referencia?: string; notas?: string;
        voucher?: { nombreArchivo: string; mimeType: string; dataBase64: string; tamanoBytes?: number };
      };

      const comprobante = await prisma.comprobante.findUnique({
        where: { id },
        select: { id: true, montoTotal: true, moneda: true },
      });
      if (!comprobante) return reply.code(404).send({ error: 'NOT_FOUND' });

      const monto = Number(b.monto);
      if (!Number.isFinite(monto) || monto <= 0) {
        return reply.code(400).send({ error: 'El monto del pago debe ser mayor a 0' });
      }

      const pago = await prisma.comprobantePago.create({
        data: {
          comprobanteId: id,
          fechaPago:     b.fechaPago ? new Date(b.fechaPago) : new Date(),
          monto,
          moneda:        b.moneda ?? comprobante.moneda ?? 'PEN',
          medio:         b.medio ?? null,
          referencia:    b.referencia ?? null,
          notas:         b.notas ?? null,
          nombreArchivo: b.voucher?.nombreArchivo ?? null,
          mimeType:      b.voucher?.mimeType ?? null,
          tamanoBytes:   b.voucher?.tamanoBytes ?? (b.voucher ? Math.round((b.voucher.dataBase64.length * 3) / 4) : null),
          dataBase64:    b.voucher?.dataBase64 ?? null,
          createdBy:     user.sub,
        },
      });

      // Settled? Compare the sum of payments against the document total. A
      // document with no total recorded is settled by its first payment.
      const agg = await prisma.comprobantePago.aggregate({
        where: { comprobanteId: id }, _sum: { monto: true }, _max: { fechaPago: true },
      });
      const pagado = Number(agg._sum.monto ?? 0);
      const total  = comprobante.montoTotal != null ? Number(comprobante.montoTotal) : null;
      const cancelada = total == null ? true : pagado + 0.005 >= total;

      await prisma.comprobante.update({
        where: { id },
        data: { fechaPago: cancelada ? (agg._max.fechaPago ?? new Date()) : null },
      });

      return reply.code(201).send({
        data: { ...pago, dataBase64: undefined },
        meta: { pagado, total, saldo: total != null ? Math.max(total - pagado, 0) : null, cancelada },
      });
    }
  );

  // ── VOUCHER (base64 on demand) ────────────────────────────────────────────
  app.get('/pagos/:pagoId/voucher', { preHandler: [requireAnyOf('FINANCE_MGR', 'ACCOUNTANT', 'OPS_MGR', 'PROCUREMENT')] },
    async (req, reply) => {
      const { pagoId } = req.params as { pagoId: string };
      const pago = await prisma.comprobantePago.findUnique({
        where: { id: pagoId },
        select: { id: true, dataBase64: true, mimeType: true, nombreArchivo: true },
      });
      if (!pago?.dataBase64) return reply.code(404).send({ error: 'NOT_FOUND' });
      return reply.send({ data: pago });
    }
  );

  // ── ANULAR PAGO ───────────────────────────────────────────────────────────
  app.delete('/pagos/:pagoId', { preHandler: [requireAnyOf('FINANCE_MGR', 'ACCOUNTANT')] },
    async (req, reply) => {
      const { pagoId } = req.params as { pagoId: string };
      const pago = await prisma.comprobantePago.findUnique({ where: { id: pagoId }, select: { comprobanteId: true } });
      if (!pago) return reply.code(404).send({ error: 'NOT_FOUND' });
      await prisma.comprobantePago.delete({ where: { id: pagoId } });

      // Re-evaluate whether the document is still settled.
      const comprobante = await prisma.comprobante.findUnique({
        where: { id: pago.comprobanteId }, select: { montoTotal: true },
      });
      const agg = await prisma.comprobantePago.aggregate({
        where: { comprobanteId: pago.comprobanteId }, _sum: { monto: true }, _max: { fechaPago: true },
      });
      const pagado = Number(agg._sum.monto ?? 0);
      const total  = comprobante?.montoTotal != null ? Number(comprobante.montoTotal) : null;
      const cancelada = pagado > 0 && (total == null || pagado + 0.005 >= total);
      await prisma.comprobante.update({
        where: { id: pago.comprobanteId },
        data:  { fechaPago: cancelada ? (agg._max.fechaPago ?? new Date()) : null },
      });
      return reply.code(204).send();
    }
  );

  // ── GLOSAS EN USO (autocomplete) ──────────────────────────────────────────
  app.get('/glosas', { preHandler: [requireAnyOf('FINANCE_MGR', 'ACCOUNTANT', 'OPS_MGR', 'PROCUREMENT')] },
    async (_req, reply) => {
      const rows = await prisma.comprobante.groupBy({
        by: ['glosa'],
        where: { glosa: { not: null } },
        _count: { _all: true },
        orderBy: { _count: { glosa: 'desc' } },
        take: 100,
      });
      return reply.send({ data: rows.map(r => ({ glosa: r.glosa, usos: r._count._all })) });
    }
  );

  // ── REPORTE DETALLADO ─────────────────────────────────────────────────────
  // Every received invoice in the window with its glosa, due date, what's been
  // paid and what's outstanding, plus the same totals grouped by glosa (tipo de
  // gasto) and by supplier.
  app.get('/reporte', { preHandler: [requireAnyOf('FINANCE_MGR', 'ACCOUNTANT', 'OPS_MGR')] },
    async (req, reply) => {
      const { fechaDesde, fechaHasta, glosa, proveedorId, estadoPago, moneda } =
        req.query as Record<string, string>;

      const where: any = { estado: { not: 'ANULADO' } };
      if (fechaDesde || fechaHasta) {
        where.fecha = {};
        if (fechaDesde) where.fecha.gte = new Date(fechaDesde);
        if (fechaHasta) where.fecha.lte = new Date(fechaHasta + 'T23:59:59');
      }
      if (glosa)       where.glosa = glosa;
      if (proveedorId) where.proveedorId = proveedorId;
      if (moneda)      where.moneda = moneda;
      if (estadoPago === 'pagada')    where.fechaPago = { not: null };
      if (estadoPago === 'pendiente') where.fechaPago = null;
      if (estadoPago === 'vencida') { where.fechaPago = null; where.fechaVencimiento = { lt: new Date() }; }

      const items = await prisma.comprobante.findMany({
        where,
        orderBy: [{ fechaVencimiento: 'asc' }, { fecha: 'desc' }],
        take: 2000,
        include: {
          proveedor: { select: { id: true, businessName: true, ruc: true } },
          purchaseOrder: { select: { id: true, poNumber: true } },
          pagos: { select: { monto: true, fechaPago: true, medio: true } },
          archivos: { select: { numero: true, emisorNombre: true, emisorRuc: true, total: true, igv: true, subtotal: true } },
        },
      });

      const today = new Date();
      const rows = items.map(c => {
        const pagado = c.pagos.reduce((s, p) => s + Number(p.monto), 0);
        const total  = c.montoTotal != null ? Number(c.montoTotal) : (c.archivos[0]?.total != null ? Number(c.archivos[0]!.total) : 0);
        const saldo  = Math.max(total - pagado, 0);
        const diasVencido = c.fechaVencimiento && !c.fechaPago
          ? Math.floor((today.getTime() - new Date(c.fechaVencimiento).getTime()) / 86400_000)
          : null;
        return {
          id: c.id,
          fecha: c.fecha,
          fechaVencimiento: c.fechaVencimiento,
          fechaPago: c.fechaPago,
          diasVencido: diasVencido != null && diasVencido > 0 ? diasVencido : null,
          numero: c.archivos[0]?.numero ?? null,
          tipoDoc: c.tipoDoc,
          descripcion: c.descripcion,
          glosa: c.glosa,
          proveedor: c.proveedor?.businessName ?? c.archivos[0]?.emisorNombre ?? null,
          proveedorRuc: c.proveedor?.ruc ?? c.archivos[0]?.emisorRuc ?? null,
          poNumber: c.purchaseOrder?.poNumber ?? null,
          moneda: c.moneda,
          subtotal: c.archivos[0]?.subtotal != null ? Number(c.archivos[0]!.subtotal) : null,
          igv: c.archivos[0]?.igv != null ? Number(c.archivos[0]!.igv) : null,
          total,
          pagado,
          saldo,
          estadoPago: c.fechaPago ? 'PAGADA' : (diasVencido != null && diasVencido > 0 ? 'VENCIDA' : 'PENDIENTE'),
        };
      });

      const group = (key: 'glosa' | 'proveedor') => {
        const m = new Map<string, { key: string; documentos: number; total: number; pagado: number; saldo: number }>();
        for (const r of rows) {
          const k = (r[key] as string | null) ?? 'Sin asignar';
          const cur = m.get(k) ?? { key: k, documentos: 0, total: 0, pagado: 0, saldo: 0 };
          cur.documentos += 1; cur.total += r.total; cur.pagado += r.pagado; cur.saldo += r.saldo;
          m.set(k, cur);
        }
        return [...m.values()].sort((a, b) => b.total - a.total);
      };

      return reply.send({
        data: {
          rows,
          porGlosa: group('glosa'),
          porProveedor: group('proveedor'),
          totales: {
            documentos: rows.length,
            total:  rows.reduce((s, r) => s + r.total, 0),
            pagado: rows.reduce((s, r) => s + r.pagado, 0),
            saldo:  rows.reduce((s, r) => s + r.saldo, 0),
            vencido: rows.filter(r => r.estadoPago === 'VENCIDA').reduce((s, r) => s + r.saldo, 0),
          },
        },
      });
    }
  );

  app.get('/stats/summary', { preHandler: [requireAnyOf('FINANCE_MGR', 'ACCOUNTANT', 'OPS_MGR')] },
    async (_req, reply) => {
      const [total, pendientes, validados, mesActual, emailPendientes, porPagar, vencidas] = await prisma.$transaction([
        prisma.comprobante.count(),
        prisma.comprobante.count({ where: { estado: 'PENDIENTE' } }),
        prisma.comprobante.count({ where: { estado: 'VALIDADO' } }),
        prisma.comprobante.count({
          where: {
            fecha: {
              gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
            },
          },
        }),
        prisma.comprobante.count({ where: { source: 'EMAIL', estado: 'PENDIENTE' } }),
        // Control de pagos: aún sin cancelar, y de esas las ya vencidas.
        prisma.comprobante.count({ where: { fechaPago: null, estado: { not: 'ANULADO' } } }),
        prisma.comprobante.count({ where: { fechaPago: null, estado: { not: 'ANULADO' }, fechaVencimiento: { lt: new Date() } } }),
      ]);

      const montoAgg = await prisma.comprobante.aggregate({
        _sum: { montoTotal: true },
        where: { estado: { not: 'ANULADO' } },
      });

      return reply.send({
        data: {
          total,
          pendientes,
          validados,
          mesActual,
          emailPendientes,
          porPagar,
          vencidas,
          montoTotalPen: montoAgg._sum.montoTotal ?? 0,
        },
      });
    }
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Email-ingest helpers (re-exported from extractor.ts for backward compat)
// ─────────────────────────────────────────────────────────────────────────────
function mimeToArchivoTipo(mime: string): ComprobanteArchivoTipo {
  return archivoTipoFromMime(mime);
}

function guessDocTypeFromFilename(filename: string): ComprobanteDocType {
  return _guessDocTypeFromFilename(filename);
}
