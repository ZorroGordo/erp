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
        moneda, fechaPago,
      } = req.query as Record<string, string>;

      const skip  = (parseInt(page) - 1) * parseInt(limit);
      const take  = Math.min(parseInt(limit), 100);

      const where: any = {};
      if (estado)          where.estado = estado as ComprobanteEstado;
      if (source)          where.source = source;
      if (moneda)          where.moneda = moneda;
      if (fechaPago) {
        const today = new Date();
        if (fechaPago === 'vencida')  where.fechaPago = { lt: today };
        else if (fechaPago === 'proxima') where.fechaPago = { gte: today, lte: new Date(Date.now() + 7*86400_000) };
        else if (fechaPago === 'sin_fecha') where.fechaPago = null;
      }
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

      const comprobante = await prisma.comprobante.create({
        data: {
          descripcion,
          fecha:           extracted0?.fechaEmision ?? resolvedFecha,
          moneda:          resolvedMoneda,
          montoTotal:      resolvedMonto,
          purchaseOrderId: purchaseOrderId ?? null,
          invoiceId:       invoiceId       ?? null,
          consolidacionRef: consolidacionRef ?? null,
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
      const allowed = ['descripcion','fecha','moneda','montoTotal','fechaPago','proveedorId','purchaseOrderId','invoiceId','consolidacionRef','estado','notas','tags'];
      const data: Record<string, unknown> = {};
      for (const k of allowed) if (k in body) {
        if (k === 'fecha' || k === 'fechaPago') {
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
  app.get('/stats/summary', { preHandler: [requireAnyOf('FINANCE_MGR', 'ACCOUNTANT', 'OPS_MGR')] },
    async (_req, reply) => {
      const [total, pendientes, validados, mesActual, emailPendientes] = await prisma.$transaction([
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
