// ── Emisión de facturas/boletas vía Factpro v3 (Sprint D 10/2026) ────────────
// Antes se usaba la API v2 (dev.factpro.la/api/v2), que rechaza el token de
// empresa: todas las emisiones desde el ERP terminaban REJECTED.
import { prisma } from '../../lib/prisma';
import { config } from '../../config';
import { notifyInvoiceEmitted } from '../../services/notifications';
import {
  buildDocumentoV3, emitirDocumentoV3, consultarDocumentoV3, v3Status, factproErrorText,
  type FactproV3Response,
} from './factpro';

export class EmitError extends Error {
  constructor(public statusCode: number, public code: string, message: string) { super(message); }
}

/** Siguiente correlativo local de una serie (máximo numérico, no orden de texto). */
export async function nextCorrelative(series: string): Promise<string> {
  const rows = await prisma.invoice.findMany({ where: { series }, select: { correlative: true } });
  const max = rows.reduce((m, r) => Math.max(m, parseInt(r.correlative, 10) || 0), 0);
  return String(max + 1).padStart(8, '0');
}

function fieldsFromResponse(res: FactproV3Response) {
  const status = v3Status(res);
  return {
    status,
    data: {
      status: status as never,
      hashCpe: res.data?.hash ?? null,
      qrCodeUrl: res.data?.qr ?? null,
      pdfUrl: res.archivos?.pdf || null,
      xmlUrl: res.archivos?.xml || null,
      cdrResponse: res as never,
      rejectionReason: status === 'REJECTED' ? factproErrorText(res) : null,
    },
  };
}

/** Emite una factura o boleta en estado DRAFT/REJECTED. Devuelve el estado final. */
export async function emitInvoice(id: string) {
  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: { lines: true, customer: { include: { addresses: true } } },
  });
  if (!invoice) throw new EmitError(404, 'NOT_FOUND', 'Comprobante no encontrado');
  if (invoice.status === 'ACCEPTED') throw new EmitError(422, 'ALREADY_EMITTED', 'El comprobante ya fue aceptado por SUNAT');
  if (invoice.status === 'SENT')     throw new EmitError(422, 'IN_PROGRESS', 'El comprobante ya fue enviado; usa «Actualizar estado»');
  if (invoice.status === 'VOIDED')   throw new EmitError(422, 'INVOICE_VOIDED', 'El comprobante está anulado');
  if (invoice.docType !== 'FACTURA' && invoice.docType !== 'BOLETA') {
    throw new EmitError(422, 'DOC_TYPE_NOT_EMITTABLE', 'Por ahora solo se emiten facturas y boletas desde el ERP (notas de crédito/débito: desde Factpro)');
  }

  const doc = (invoice.entityDocNo ?? '').trim();
  const total = Number(invoice.totalPen);
  if (invoice.docType === 'FACTURA' && !/^\d{11}$/.test(doc)) {
    throw new EmitError(422, 'RUC_REQUIRED', 'La factura necesita el RUC (11 dígitos) del cliente');
  }
  if (invoice.docType === 'BOLETA' && total > 700 && !/^\d{8}$|^\d{11}$/.test(doc)) {
    throw new EmitError(422, 'DNI_REQUIRED', 'Boletas mayores a S/ 700 necesitan DNI del cliente');
  }
  if (!invoice.lines.length) throw new EmitError(422, 'NO_LINES', 'El comprobante no tiene líneas');

  const serie = invoice.docType === 'BOLETA' ? config.FACTPRO_SERIE_BOLETA : config.FACTPRO_SERIE_FACTURA;
  const addr = invoice.customer?.addresses?.find(a => a.isDefault) ?? invoice.customer?.addresses?.[0];
  const payload = buildDocumentoV3({
    serie,
    entityDocNo: doc,
    entityName: invoice.entityName,
    entityAddress: addr ? [addr.addressLine1, addr.district, addr.province].filter(Boolean).join(', ') : '',
    entityEmail: invoice.entityEmail,
    issueDate: new Date(),     // SUNAT exige fecha de emisión = fecha de envío (o pocos días antes)
    currency: invoice.currency,
    paymentDueDate: invoice.docType === 'FACTURA' ? invoice.paymentDueDate : null,
    totalPen: total,
    items: invoice.lines.map(l => ({
      descripcion: l.description,
      cantidad: Number(l.qty),
      valorUnitario: Number(l.unitPrice),
      igvRate: Number(l.igvRate),
      unidad: (l as any).unitCode ?? 'NIU',
    })),
  });

  await prisma.invoice.update({ where: { id }, data: { status: 'SENT' as never, rejectionReason: null } });
  let res: FactproV3Response;
  try {
    res = await emitirDocumentoV3(payload);
  } catch (err: any) {
    await prisma.invoice.update({ where: { id }, data: { status: 'REJECTED', rejectionReason: err.message, cdrResponse: (err.detail ?? null) as never } });
    throw new EmitError(err.statusCode ?? 502, 'FACTPRO_ERROR', err.message);
  }

  const { status, data } = fieldsFromResponse(res);
  // 1) Guardar SIEMPRE la respuesta de Factpro primero (que no se pierda nada).
  let updated = await prisma.invoice.update({ where: { id }, data: { ...data, issueDate: new Date() } });
  // 2) Número oficial: «F001-3» / «F001-00000003» → serie F001, correlativo "3".
  const m = (res.data?.numero ?? '').match(/^([A-Z0-9]{4})-0*(\d+)$/i);
  if (m) {
    const [, s, n] = m;
    // Un borrador/rechazado local (nunca emitido) puede ocupar ese número: se le
    // asigna otro número local. Un comprobante ya emitido nunca se toca.
    const clash = await prisma.invoice.findFirst({
      where: { series: s, correlative: { in: [n, n.padStart(8, '0')] }, id: { not: id } },
      select: { id: true, hashCpe: true, status: true },
    });
    if (clash && !clash.hashCpe && (clash.status === 'DRAFT' || clash.status === 'REJECTED')) {
      const tmp = `L${Date.now().toString().slice(-7)}`;   // número local temporal, fuera del rango fiscal
      await prisma.invoice.update({ where: { id: clash.id }, data: { correlative: tmp } });
    }
    try {
      updated = await prisma.invoice.update({ where: { id }, data: { series: s, correlative: n } });
    } catch (err: any) {
      console.error('[emit] no se pudo guardar el número Factpro', res.data?.numero, err?.code, err?.meta);
    }
  }

  if (status !== 'REJECTED') {
    notifyInvoiceEmitted({
      series: updated.series,
      correlative: updated.correlative,
      entityName: updated.entityName,
      entityEmail: updated.entityEmail ?? null,
      totalPen: total,
      pdfUrl: updated.pdfUrl,
    }).catch(console.error);
  }
  return { status, invoice: updated, factpro: res };
}

/** Consulta en Factpro el estado SUNAT de una factura/boleta ya enviada. */
export async function refreshInvoiceStatus(id: string) {
  const invoice = await prisma.invoice.findUnique({ where: { id } });
  if (!invoice) throw new EmitError(404, 'NOT_FOUND', 'Comprobante no encontrado');
  if (invoice.docType !== 'FACTURA' && invoice.docType !== 'BOLETA') {
    throw new EmitError(422, 'NOT_SUPPORTED', 'Solo facturas y boletas tienen consulta de estado');
  }
  const numero = parseInt(invoice.correlative, 10);
  if (!numero) throw new EmitError(422, 'NOT_EMITTED', 'El comprobante no tiene número de Factpro');
  const res = await consultarDocumentoV3(invoice.series, numero);
  if (res.exito === false) return { status: invoice.status, invoice, factpro: res };   // no encontrado: no tocar
  const { status, data } = fieldsFromResponse(res);
  const updated = await prisma.invoice.update({ where: { id }, data });
  return { status, invoice: updated, factpro: res };
}
