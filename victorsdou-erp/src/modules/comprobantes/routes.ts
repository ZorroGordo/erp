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
import * as crypto from 'crypto';

const prisma = new PrismaClient();

// ── Dynamic require for pdf-parse v2 (CJS / ESM interop) ─────────────────────
// eslint-disable-next-line @typescript-eslint/no-var-requires
const _require = (id: string) => require(id);

// ─────────────────────────────────────────────────────────────────────────────
//  SUNAT XML Extractor  (UBL 2.1 — Factura / Boleta / Nota / Guía)
// ─────────────────────────────────────────────────────────────────────────────
interface ExtractedDoc {
  serie?: string;
  correlativo?: string;
  numero?: string;
  fechaEmision?: Date;
  emisorRuc?: string;
  emisorNombre?: string;
  receptorRuc?: string;
  receptorNombre?: string;
  monedaDoc?: string;
  subtotal?: number;
  igv?: number;
  total?: number;
}

function extractFromSunatXml(xml: string): ExtractedDoc {
  const tag  = (name: string) => xml.match(new RegExp(`<cbc:${name}[^>]*>([^<]+)<\\/cbc:${name}>`))?.[1]?.trim();
  const tag2 = (name: string) => xml.match(new RegExp(`<[^:]+:${name}[^>]*>([^<]+)<\\/[^:]+:${name}>`))?.[1]?.trim();

  const id           = tag('ID');
  const issueDate    = tag('IssueDate');
  const currencyCode = tag('DocumentCurrencyCode') ?? tag2('DocumentCurrencyCode');

  // Supplier (emisor) RUC — schemeID="6" means RUC in SUNAT
  const supplierRucM  = xml.match(/<cac:AccountingSupplierParty[\s\S]*?<cbc:ID[^>]*schemeID="6"[^>]*>(\d+)<\/cbc:ID>/);
  const supplierRuc   = supplierRucM?.[1];
  const supplierNameM = xml.match(/<cac:AccountingSupplierParty[\s\S]*?<cbc:RegistrationName>([^<]+)<\/cbc:RegistrationName>/);
  const supplierName  = supplierNameM?.[1]?.trim().replace(/&amp;/g, '&');

  // Receiver (receptor) — customer RUC or DNI
  const customerRucM  = xml.match(/<cac:AccountingCustomerParty[\s\S]*?<cbc:ID[^>]*>(\d+)<\/cbc:ID>/);
  const customerRuc   = customerRucM?.[1];
  const customerNameM = xml.match(/<cac:AccountingCustomerParty[\s\S]*?<cbc:RegistrationName>([^<]+)<\/cbc:RegistrationName>/);
  const customerName  = customerNameM?.[1]?.trim().replace(/&amp;/g, '&');

  // Monetary totals
  const payable  = xml.match(/<cbc:PayableAmount[^>]*>([\d.]+)<\/cbc:PayableAmount>/)?.[1];
  const taxAmt   = xml.match(/<cbc:TaxAmount[^>]*>([\d.]+)<\/cbc:TaxAmount>/)?.[1];
  const lineExt  = xml.match(/<cbc:LineExtensionAmount[^>]*>([\d.]+)<\/cbc:LineExtensionAmount>/)?.[1];

  // Parse serie / correlativo from "F001-00001234"
  let serie: string | undefined, correlativo: string | undefined;
  if (id) {
    const parts = id.split('-');
    if (parts.length === 2) { serie = parts[0]; correlativo = parts[1]; }
  }

  return {
    serie,
    correlativo,
    numero: id,
    fechaEmision: issueDate ? new Date(issueDate) : undefined,
    emisorRuc: supplierRuc,
    emisorNombre: supplierName,
    receptorRuc: customerRuc,
    receptorNombre: customerName,
    monedaDoc: currencyCode ?? 'PEN',
    total:    payable  ? parseFloat(payable)  : undefined,
    igv:      taxAmt   ? parseFloat(taxAmt)   : undefined,
    subtotal: lineExt  ? parseFloat(lineExt)  : undefined,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
//  PDF Heuristic Extractor
// ─────────────────────────────────────────────────────────────────────────────
async function extractFromPdf(b64: string, password?: string): Promise<ExtractedDoc> {
  try {
    const { PDFParse } = _require('pdf-parse') as {
      PDFParse: new (opts: { data: Uint8Array; password?: string }) => { getText(): Promise<{ text: string }> };
    };
    const buf    = Buffer.from(b64, 'base64');
    const parser = new PDFParse({ data: new Uint8Array(buf), ...(password ? { password } : {}) });
    const { text } = await parser.getText();

    // Serie-correlativo pattern  (e.g. F001-00001234 or B001-12345678)
    const numM  = text.match(/\b([A-Z]\d{3}-\d{4,8})\b/);
    const num   = numM?.[1];
    let serie: string | undefined, correlativo: string | undefined;
    if (num) { const p = num.split('-'); serie = p[0]; correlativo = p[1]; }

    // RUC  (11 digits starting with 20 or 10)
    const rucM = text.match(/(?:RUC|R\.U\.C\.)\s*[:\s#]?\s*((?:20|10)\d{9})/i);
    const ruc  = rucM?.[1];

    // Date: DD/MM/YYYY or DD-MM-YYYY
    const dateM = text.match(/(\d{2})[\/\-](\d{2})[\/\-](\d{4})/);
    let fecha: Date | undefined;
    if (dateM) fecha = new Date(`${dateM[3]}-${dateM[2]}-${dateM[1]}`);

    // Total — look for last currency amount after keywords
    const totalM = text.match(/(?:TOTAL[^\n]*?|IMPORTE TOTAL[^\n]*?)\s*S\/\.?\s*([\d,]+\.?\d*)/i);
    const igvM   = text.match(/(?:IGV|I\.G\.V\.)[^\n]*?\s*S\/\.?\s*([\d,]+\.?\d*)/i);
    const baseM  = text.match(/(?:SUB[- ]TOTAL|BASE IMPONIBLE)[^\n]*?\s*S\/\.?\s*([\d,]+\.?\d*)/i);

    const parse = (s?: string) => s ? parseFloat(s.replace(/,/g, '')) : undefined;

    return {
      serie, correlativo, numero: num,
      fechaEmision: fecha,
      emisorRuc: ruc,
      total:    parse(totalM?.[1]),
      igv:      parse(igvM?.[1]),
      subtotal: parse(baseM?.[1]),
      monedaDoc: text.includes('USD') ? 'USD' : 'PEN',
    };
  } catch {
    return {};
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Helper: detect archive type from MIME
// ─────────────────────────────────────────────────────────────────────────────
function archivoTipoFromMime(mime: string): ComprobanteArchivoTipo {
  if (mime === 'application/pdf')   return 'PDF';
  if (mime.startsWith('image/'))    return 'IMAGEN';
  if (mime.includes('xml'))         return 'XML';
  return 'PDF';
}

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
      } = req.query as Record<string, string>;

      const skip  = (parseInt(page) - 1) * parseInt(limit);
      const take  = Math.min(parseInt(limit), 100);

      const where: any = {};
      if (estado)          where.estado = estado as ComprobanteEstado;
      if (source)          where.source = source;
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

      const comprobante = await prisma.comprobante.create({
        data: {
          descripcion,
          fecha:           new Date(fecha),
          moneda,
          montoTotal:      montoTotal ?? archivoData ? (archivoData as any).total : undefined,
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
      const allowed = ['descripcion','fecha','moneda','montoTotal','purchaseOrderId','invoiceId','consolidacionRef','estado','notas','tags'];
      const data: Record<string, unknown> = {};
      for (const k of allowed) if (k in body) data[k] = k === 'fecha' ? new Date(body[k] as string) : body[k];

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

  // ── MAILGUN EMAIL INGEST (public webhook — verified by signature) ─────────
  // Mailgun POSTs here when an email arrives at comprobantes@<your-domain>.
  // The endpoint is intentionally unauthenticated (no JWT) but protected by
  // the Mailgun webhook signing key (MAILGUN_SIGNING_KEY env var).
  app.post('/email-ingest', { config: { rawBody: true } }, async (req, reply) => {
    try {
      // ── 1. Parse multipart form fields + attachments ──────────────────────
      const fields: Record<string, string> = {};
      const attachments: Array<{ filename: string; mimeType: string; buffer: Buffer }> = [];

      const parts = (req as any).parts();
      for await (const part of parts) {
        if (part.type === 'file') {
          const chunks: Buffer[] = [];
          for await (const chunk of part.file) chunks.push(chunk);
          attachments.push({
            filename: part.filename ?? 'attachment',
            mimeType: part.mimetype ?? 'application/octet-stream',
            buffer: Buffer.concat(chunks),
          });
        } else {
          fields[part.fieldname] = part.value as string;
        }
      }

      // ── 2. Verify Mailgun signature ────────────────────────────────────────
      const signingKey = process.env.MAILGUN_SIGNING_KEY;
      if (signingKey) {
        const { timestamp = '', token = '', signature = '' } = fields;
        const computed = crypto
          .createHmac('sha256', signingKey)
          .update(timestamp + token)
          .digest('hex');
        if (!crypto.timingSafeEqual(Buffer.from(computed, 'hex'), Buffer.from(signature, 'hex'))) {
          return reply.code(403).send({ error: 'INVALID_SIGNATURE' });
        }
      }

      if (attachments.length === 0) {
        // No attachments — accept but don't create a comprobante
        return reply.code(200).send({ ok: true, created: false, reason: 'no_attachments' });
      }

      const sender  = fields['sender']  ?? fields['from'] ?? 'email-desconocido';
      const subject = fields['subject'] ?? 'Sin asunto';

      // ── 3. Create Comprobante with source = EMAIL ─────────────────────────
      const firstAttach = attachments[0];
      const firstB64    = firstAttach.buffer.toString('base64');
      const firstExtract = await autoExtract(firstAttach.mimeType, firstB64);
      const archivoTipo  = mimeToArchivoTipo(firstAttach.mimeType);

      const comprobante = await prisma.comprobante.create({
        data: {
          descripcion:  subject,
          fecha:        firstExtract.fechaEmision ?? new Date(),
          moneda:       'PEN',
          source:       'EMAIL' as any,
          senderEmail:  sender,
          emailSubject: subject,
          createdBy:    sender,
          archivos: {
            create: attachments.map((att) => {
              const b64     = att.buffer.toString('base64');
              const tipo    = mimeToArchivoTipo(att.mimeType);
              const docType = guessDocTypeFromFilename(att.filename);
              return {
                docType,
                archivoTipo: tipo,
                nombreArchivo: att.filename,
                mimeType:  att.mimeType,
                tamanoBytes: att.buffer.length,
                dataBase64: b64,
              };
            }),
          },
        },
      });

      // Kick off async extraction for all files
      for (const arch of await prisma.comprobanteArchivo.findMany({ where: { comprobanteId: comprobante.id } })) {
        try {
          const extracted = await autoExtract(arch.mimeType, arch.dataBase64);
          if (Object.keys(extracted).length > 0) {
            await prisma.comprobanteArchivo.update({ where: { id: arch.id }, data: extracted as any });
          }
        } catch { /* best-effort */ }
      }

      return reply.code(200).send({ ok: true, created: true, id: comprobante.id });
    } catch (err: unknown) {
      req.log.error(err, 'email-ingest error');
      return reply.code(200).send({ ok: false, error: 'internal' }); // always 200 to Mailgun
    }
  });

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
//  Auto-extract helper — chooses XML vs PDF path
// ─────────────────────────────────────────────────────────────────────────────
async function autoExtract(mimeType: string, dataBase64: string): Promise<ExtractedDoc> {
  try {
    if (mimeType.includes('xml')) {
      const xmlText = Buffer.from(dataBase64, 'base64').toString('utf-8');
      return extractFromSunatXml(xmlText);
    }
    if (mimeType === 'application/pdf') {
      return await extractFromPdf(dataBase64);
    }
  } catch { /* silent — extraction is best-effort */ }
  return {};
}

// ─────────────────────────────────────────────────────────────────────────────
//  Email-ingest helpers
// ─────────────────────────────────────────────────────────────────────────────
function mimeToArchivoTipo(mime: string): ComprobanteArchivoTipo {
  if (mime === 'application/pdf') return 'PDF';
  if (mime.startsWith('image/'))  return 'IMAGEN';
  if (mime.includes('xml'))       return 'XML';
  return 'PDF'; // fallback
}

function guessDocTypeFromFilename(filename: string): ComprobanteDocType {
  const n = filename.toLowerCase();
  if (n.includes('factura') || n.includes('fact'))          return 'FACTURA';
  if (n.includes('boleta')  || n.includes('bol'))           return 'BOLETA';
  if (n.includes('guia')    || n.includes('guía'))          return 'GUIA_REMISION';
  if (n.includes('orden')   || n.includes('oc_'))           return 'ORDEN_COMPRA';
  if (n.includes('honorario') || n.includes('rh_'))         return 'RECIBO_HONORARIOS';
  if (n.includes('nota')    && n.includes('cred'))          return 'NOTA_CREDITO';
  if (n.includes('nota')    && n.includes('deb'))           return 'NOTA_DEBITO';
  return 'FACTURA'; // safe default
}
