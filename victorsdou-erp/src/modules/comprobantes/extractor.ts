// ─────────────────────────────────────────────────────────────────────────────
//  extractor.ts — Shared document field-extraction helpers
//
//  Supports:
//    • SUNAT UBL 2.1 XML  (Facturas, Boletas, Notas, Guías)
//    • PDF text heuristics (via pdf-parse v2 Node build, with v1 API fallback)
//    • Image OCR           (via tesseract.js — Spanish+English, eng fallback)
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
  // Normalise whitespace (preserve line breaks for name extraction)
  const t = text.replace(/[ \t]+/g, ' ');

  // Serie-correlativo: F001-00001234 or B001-12345678 (SUNAT UBL format)
  const numM = t.match(/([A-Z]\d{3}-\d{4,8})/);
  const num  = numM?.[1];
  let serie: string | undefined, correlativo: string | undefined;
  if (num) { const p = num.split('-'); serie = p[0]; correlativo = p[1]; }

  // Context-aware RUC: classify emisor vs receptor by surrounding keywords.
  const rucRe = /(?:RUC|R\.U\.C\.)\s*[:#]?\s*((20|10)\d{9})/gi;
  let mr: RegExpExecArray | null;
  let emisorRuc: string | undefined;
  let receptorRuc: string | undefined;
  while ((mr = rucRe.exec(t)) !== null) {
    const before = t.slice(Math.max(0, mr.index - 200), mr.index);
    const isRecep = /(?:SE[NÑ]OR|CLIENTE|RECEPTOR|ADQUIRENTE|COMPRADOR|DESTINATARIO)/i.test(before);
    if (isRecep && !receptorRuc) {
      receptorRuc = mr[1];
    } else if (!isRecep && !emisorRuc) {
      emisorRuc = mr[1];
    } else if (emisorRuc && !receptorRuc) {
      receptorRuc = mr[1];
    }
  }
  if (!emisorRuc) {
    const fm = /(?:RUC|R\.U\.C\.)\s*[:#]?\s*((20|10)\d{9})/i.exec(t);
    if (fm) emisorRuc = fm[1];
  }

  // Emisor name: last meaningful line before the emisor RUC number
  let emisorNombre: string | undefined;
  if (emisorRuc) {
    const eidx = t.indexOf(emisorRuc);
    if (eidx > 20) {
      const ctx = t.slice(Math.max(0, eidx - 400), eidx);
      const ctxLines = ctx.split('\n')
        .map((l: string) => l.trim())
        .filter((l: string) => l.length > 3 && !/^RUC/i.test(l) && !/^\d{11}$/.test(l) && !/^R\.U\.C\./i.test(l));
      if (ctxLines.length > 0) emisorNombre = ctxLines[ctxLines.length - 1];
    }
  }

  // Date: prefer labelled emission date (DD/MM/YYYY), then any date
  const emM = t.match(/(?:fecha\s*(?:de\s*)?emisi[oó]n|emitido|issue\s*date)[^\d]{0,20}(\d{2})[-/. ](\d{2})[-/. ](\d{4})/i);
  const anyM = t.match(/(\d{2})[-/. ](\d{2})[-/. ](\d{4})/);
  let fecha: Date | undefined;
  const dm = emM ?? anyM;
  if (dm) {
    const [g1, g2, g3] = [dm[1], dm[2], dm[3]];
    const dtDMY = new Date(`${g3}-${g2}-${g1}`);
    if (!isNaN(dtDMY.getTime())) {
      fecha = dtDMY;
    } else {
      const dtMDY = new Date(`${g3}-${g1}-${g2}`);
      if (!isNaN(dtMDY.getTime())) fecha = dtMDY;
    }
  }

  const parse = (s?: string) => (s ? parseFloat(s.replace(/,/g, '')) : undefined);

  // Total: expanded label list + wider spacing tolerance
  const totalM =
    t.match(/(?:IMPORTE\s+TOTAL|TOTAL\s+A\s+PAGAR|TOTAL\s+FACTURA|TOTAL\s+BOLETA|TOTAL\s+GENERAL|TOTAL\s+VENTA|TOTAL\s+COMPROBANTE|MONTO\s+TOTAL|TOTAL\s+NETO|PRECIO\s+TOTAL)[^\d]{0,60}(\d[\d,]*\.\d{2})/i) ??
    t.match(/(?<![A-Za-z])TOTAL:?\s*(?:S\/\.?\s*|PEN\s*|USD\s*|GBP\s*|EUR\s*)?(\d[\d,]*\.\d{2})/i);

  const igvM =
    t.match(/(?:IGV|I\.G\.V\.?|18%)\s*[^\d]{0,40}(?:S\/\.?\s*)?(\d[\d,]*\.\d{2})/i);

  const baseM =
    t.match(/(?:SUB\s*-?\s*TOTAL|SUBTOTAL|BASE\s+IMPONIBLE|OP(?:ERACIONES)?\s+GRAVADAS|OP\.\s+GRAVADA)[^\d]{0,60}(?:S\/\.?\s*)?(\d[\d,]*\.\d{2})/i);

  // Currency: default PEN, support USD, GBP, EUR
  let moneda = 'PEN';
  if      (/(USD|US\$|D[OÓ]LARES)/i.test(t)) moneda = 'USD';
  else if (/(GBP|LIBRAS)/i.test(t))           moneda = 'GBP';
  else if (/(EUR|EUROS)/i.test(t))            moneda = 'EUR';
  else if (/SOLES|S\/\.|PEN/i.test(t))        moneda = 'PEN';

  return {
    serie, correlativo, numero: num,
    fechaEmision: fecha,
    emisorRuc,
    emisorNombre,
    receptorRuc,
    monedaDoc: moneda,
    total:    parse(totalM?.[1]),
    igv:      parse(igvM?.[1]),
    subtotal: parse(baseM?.[1]),
  };
}


export async function extractFromPdf(b64: string, password?: string): Promise<ExtractedDoc> {
  const buf = Buffer.from(b64, 'base64');
  let cleanText = '';

  // ?? Attempt 1: pdf-parse v2 API ???????????????????????????????????????????
  // In pdf-parse v2, PDFParse lives in the *default* export (not '/node').
  // The '/node' subpath only exports getHeader() for URL inspection.
  try {
    const pdfMod = _require('pdf-parse');
    // CJS build exports named: { PDFParse, ... }
    const PDFParse: (new (opts: { data: Uint8Array; password?: string }) => {
      getText(): Promise<{ text: string }>;
      getScreenshot(opts: { pages: number[]; width: number }): Promise<{
        pages: Array<{ data: Record<number, number> }>;
        total: number;
      }>;
    }) | undefined = pdfMod.PDFParse ?? pdfMod.default?.PDFParse;

    if (PDFParse && typeof PDFParse === 'function') {
      const parser = new PDFParse({ data: new Uint8Array(buf), ...(password ? { password } : {}) });
      const { text } = await parser.getText();
      cleanText = text.replace(/--\s*\d+\s*of\s*\d+\s*--/g, '').trim();
      if (cleanText.length > 20) {
        return extractTextHeuristics(cleanText);
      }
      // Image-based / scanned PDF: render page 1 to PNG then OCR it.
      try {
        const ss = await parser.getScreenshot({ pages: [1], width: 2000 });
        const pageData = ss.pages[0]?.data;
        if (pageData) {
          const imgBuf = Buffer.from(Object.values(pageData) as number[]);
          const ocrResult = await extractFromImage(imgBuf.toString('base64'));
          if (Object.keys(ocrResult).length > 1) return ocrResult;
        }
      } catch (err) { console.error('[ext] screenshot:', err instanceof Error ? err.message : String(err)); }
    } else {
      console.error('[ext] PDFParse class not found in pdf-parse exports. Keys:', Object.keys(pdfMod).join(','));
    }
  } catch (err) { console.error('[ext] pdf-parse v2 attempt:', err instanceof Error ? err.message : String(err)); }

  return {};
}

export async function extractFromImage(b64: string): Promise<ExtractedDoc> {
  const imageBuffer = Buffer.from(b64, 'base64');

  // Try spa+eng first (best quality for Peruvian invoices), fall back to eng
  // if the Spanish language pack fails to download (common in Docker/Railway).
  for (const langs of ['spa+eng', 'eng']) {
    try {
      const { createWorker } = _require('tesseract.js') as {
        createWorker: (langs: string, oem?: number, opts?: Record<string, unknown>) => Promise<{
          recognize(image: Buffer): Promise<{ data: { text: string } }>;
          terminate(): Promise<void>;
        }>;
      };
      // OEM 1 = LSTM only (faster / more accurate than legacy)
      // cachePath: use /tmp so Docker containers can cache downloaded lang data
      const worker = await createWorker(langs, 1, {
        errorHandler: () => {},
        cachePath: process.env.TESSDATA_PREFIX ?? '/tmp',
      });
      const { data: { text } } = await worker.recognize(imageBuffer);
      await worker.terminate();
      if (text?.trim().length > 10) return extractTextHeuristics(text);
    } catch {
      // Language data unavailable or WASM failed — try next lang set
    }
  }

  // Tesseract not installed or all lang attempts failed
  return {};
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
  } catch (err) { console.error("[ext]", err instanceof Error ? err.message : String(err)); }
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
