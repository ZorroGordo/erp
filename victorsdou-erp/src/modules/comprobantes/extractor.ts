// ─────────────────────────────────────────────────────────────────────────────
//  extractor.ts — Shared document field-extraction helpers
//
//  Supports:
//    • SUNAT UBL 2.1 XML  (Facturas, Boletas, Notas, Guías)
//    • PDF text heuristics (via pdf-parse v2)
//    • Image OCR           (via tesseract.js — Spanish + English)
//
//  All functions are best-effort: failures return an empty object rather
//  than throwing, so the calling code can always store the raw file even
//  when extraction fails.
// ─────────────────────────────────────────────────────────────────────────────

import type { ComprobanteArchivoTipo, ComprobanteDocType } from '@prisma/client';

// CJS interop shim (pdf-parse and tesseract.js ship as CJS modules)
// eslint-disable-next-line @typescript-eslint/no-var-requires
const _require = (id: string) => require(id);

// ─────────────────────────────────────────────────────────────────────────────
//  Shared result type
// ─────────────────────────────────────────────────────────────────────────────
export interface ExtractedDoc {
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

// ─────────────────────────────────────────────────────────────────────────────
//  SUNAT UBL 2.1 XML extractor
// ─────────────────────────────────────────────────────────────────────────────
export function extractFromSunatXml(xml: string): ExtractedDoc {
  const tag  = (name: string) => xml.match(new RegExp(`<cbc:${name}[^>]*>([^<]+)<\\/cbc:${name}>`))?.[1]?.trim();
  const tag2 = (name: string) => xml.match(new RegExp(`<[^:]+:${name}[^>]*>([^<]+)<\\/[^:]+:${name}>`))?.[1]?.trim();

  const id           = tag('ID');
  const issueDate    = tag('IssueDate');
  const currencyCode = tag('DocumentCurrencyCode') ?? tag2('DocumentCurrencyCode');

  // Supplier (emisor) — schemeID="6" = RUC
  const supplierRuc  = xml.match(/<cac:AccountingSupplierParty[\s\S]*?<cbc:ID[^>]*schemeID="6"[^>]*>(\d+)<\/cbc:ID>/)?.[1];
  const supplierName = xml.match(/<cac:AccountingSupplierParty[\s\S]*?<cbc:RegistrationName>([^<]+)<\/cbc:RegistrationName>/)?.[1]?.trim().replace(/&amp;/g, '&');

  // Customer (receptor)
  const customerRuc  = xml.match(/<cac:AccountingCustomerParty[\s\S]*?<cbc:ID[^>]*>(\d+)<\/cbc:ID>/)?.[1];
  const customerName = xml.match(/<cac:AccountingCustomerParty[\s\S]*?<cbc:RegistrationName>([^<]+)<\/cbc:RegistrationName>/)?.[1]?.trim().replace(/&amp;/g, '&');

  // Monetary totals
  const payable = xml.match(/<cbc:PayableAmount[^>]*>([\d.]+)<\/cbc:PayableAmount>/)?.[1];
  const taxAmt  = xml.match(/<cbc:TaxAmount[^>]*>([\d.]+)<\/cbc:TaxAmount>/)?.[1];
  const lineExt = xml.match(/<cbc:LineExtensionAmount[^>]*>([\d.]+)<\/cbc:LineExtensionAmount>/)?.[1];

  let serie: string | undefined, correlativo: string | undefined;
  if (id) {
    const parts = id.split('-');
    if (parts.length === 2) { serie = parts[0]; correlativo = parts[1]; }
  }

  return {
    serie,
    correlativo,
    numero:        id,
    fechaEmision:  issueDate ? new Date(issueDate) : undefined,
    emisorRuc:     supplierRuc,
    emisorNombre:  supplierName,
    receptorRuc:   customerRuc,
    receptorNombre: customerName,
    monedaDoc:     currencyCode ?? 'PEN',
    total:    payable ? parseFloat(payable)  : undefined,
    igv:      taxAmt  ? parseFloat(taxAmt)   : undefined,
    subtotal: lineExt ? parseFloat(lineExt)  : undefined,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
//  Text heuristics (used by both PDF and OCR paths)
// ─────────────────────────────────────────────────────────────────────────────
function extractTextHeuristics(text: string): ExtractedDoc {
  // Serie-correlativo: F001-00001234 or B001-12345678
  const numM = text.match(/\b([A-Z]\d{3}-\d{4,8})\b/);
  const num  = numM?.[1];
  let serie: string | undefined, correlativo: string | undefined;
  if (num) { const p = num.split('-'); serie = p[0]; correlativo = p[1]; }

  // RUC (11 digits starting with 20 or 10)
  const rucM = text.match(/(?:RUC|R\.U\.C\.)\s*[:\s#]?\s*((?:20|10)\d{9})/i);
  const ruc  = rucM?.[1];

  // Date: DD/MM/YYYY or DD-MM-YYYY
  const dateM = text.match(/(\d{2})[\/\-](\d{2})[\/\-](\d{4})/);
  let fecha: Date | undefined;
  if (dateM) fecha = new Date(`${dateM[3]}-${dateM[2]}-${dateM[1]}`);

  // Currency amounts
  const totalM = text.match(/(?:TOTAL[^\n]*?|IMPORTE TOTAL[^\n]*?)\s*S\/\.?\s*([\d,]+\.?\d*)/i);
  const igvM   = text.match(/(?:IGV|I\.G\.V\.)[^\n]*?\s*S\/\.?\s*([\d,]+\.?\d*)/i);
  const baseM  = text.match(/(?:SUB[- ]TOTAL|BASE IMPONIBLE)[^\n]*?\s*S\/\.?\s*([\d,]+\.?\d*)/i);
  const parse  = (s?: string) => s ? parseFloat(s.replace(/,/g, '')) : undefined;

  return {
    serie, correlativo, numero: num,
    fechaEmision: fecha,
    emisorRuc:    ruc,
    total:    parse(totalM?.[1]),
    igv:      parse(igvM?.[1]),
    subtotal: parse(baseM?.[1]),
    monedaDoc: text.includes('USD') ? 'USD' : 'PEN',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
//  PDF extractor (pdf-parse v2)
// ─────────────────────────────────────────────────────────────────────────────
export async function extractFromPdf(b64: string, password?: string): Promise<ExtractedDoc> {
  try {
    const { PDFParse } = _require('pdf-parse') as {
      PDFParse: new (opts: { data: Uint8Array; password?: string }) => { getText(): Promise<{ text: string }> };
    };
    const buf    = Buffer.from(b64, 'base64');
    const parser = new PDFParse({ data: new Uint8Array(buf), ...(password ? { password } : {}) });
    const { text } = await parser.getText();
    return extractTextHeuristics(text);
  } catch {
    return {};
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Image OCR extractor (tesseract.js v5 — Spanish + English)
// ─────────────────────────────────────────────────────────────────────────────
export async function extractFromImage(b64: string): Promise<ExtractedDoc> {
  try {
    const { createWorker } = _require('tesseract.js') as {
      createWorker: (langs: string, oem?: number, opts?: Record<string, unknown>) => Promise<{
        recognize(image: Buffer): Promise<{ data: { text: string } }>;
        terminate(): Promise<void>;
      }>;
    };
    // OEM 1 = LSTM only (faster / more accurate than legacy)
    const worker = await createWorker('spa+eng', 1, { errorHandler: () => {} });
    const imageBuffer = Buffer.from(b64, 'base64');
    const { data: { text } } = await worker.recognize(imageBuffer);
    await worker.terminate();
    return extractTextHeuristics(text);
  } catch {
    // Tesseract not installed, WASM init failed, or language data unavailable —
    // silently fall back to storing the image without extracted fields.
    return {};
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Universal auto-extractor
// ─────────────────────────────────────────────────────────────────────────────
export async function autoExtract(mimeType: string, dataBase64: string): Promise<ExtractedDoc> {
  try {
    if (mimeType.includes('xml')) {
      return extractFromSunatXml(Buffer.from(dataBase64, 'base64').toString('utf-8'));
    }
    if (mimeType === 'application/pdf') {
      return await extractFromPdf(dataBase64);
    }
    if (mimeType.startsWith('image/')) {
      return await extractFromImage(dataBase64);
    }
  } catch { /* silent — extraction is always best-effort */ }
  return {};
}

// ─────────────────────────────────────────────────────────────────────────────
//  MIME → enum helpers
// ─────────────────────────────────────────────────────────────────────────────
export function archivoTipoFromMime(mime: string): ComprobanteArchivoTipo {
  if (mime === 'application/pdf') return 'PDF';
  if (mime.startsWith('image/'))  return 'IMAGEN';
  if (mime.includes('xml'))       return 'XML';
  return 'PDF'; // fallback
}

export function guessDocTypeFromFilename(filename: string): ComprobanteDocType {
  const n = filename.toLowerCase();
  if (n.includes('factura') || n.includes('fact'))     return 'FACTURA';
  if (n.includes('boleta')  || n.includes('bol'))      return 'BOLETA';
  if (n.includes('guia')    || n.includes('guía'))     return 'GUIA_REMISION';
  if (n.includes('orden')   || n.includes('oc_'))      return 'ORDEN_COMPRA';
  if (n.includes('honorario') || n.includes('rh_'))    return 'RECIBO_HONORARIOS';
  if (n.includes('nota')    && n.includes('cred'))     return 'NOTA_CREDITO';
  if (n.includes('nota')    && n.includes('deb'))      return 'NOTA_DEBITO';
  return 'FACTURA'; // safe default
}
