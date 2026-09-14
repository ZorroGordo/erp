// ── Certificado de calidad → lotes + fechas de vencimiento ───────────────────
//
// Suppliers send a "certificado de calidad" (or análisis / ficha técnica) with
// each delivery. It carries the lot number and the expiry date of what is being
// delivered — exactly the two fields the warehouse otherwise re-types by hand
// into the stock-entry form.
//
// This reader is deliberately deterministic (regex over the document text, no
// LLM): certificates are semi-structured and the common Peruvian layouts are
// easy to match. Whatever it finds is a *suggestion* — the receive modal shows
// it pre-filled and a human confirms before any stock moves.

import { documentToText } from '../comprobantes/extractor';

export interface DetectedLot {
  lotNumber?: string;
  expiryDate?: string;      // ISO yyyy-mm-dd
  productionDate?: string;  // ISO yyyy-mm-dd
  rawLine?: string;
}

const LOT_LABEL  = '(?:n[°ºo]?\\s*(?:de\\s*)?)?(?:lote|lot|l\\.?o\\.?t\\.?e?|batch|partida)';
const EXP_LABEL  = '(?:fecha\\s*(?:de\\s*)?)?(?:vencimiento|vence|vto|venc|caducidad|expira(?:ci[oó]n)?|exp(?:iry)?|best\\s*before|consumir\\s*(?:antes|preferentemente))';
const PROD_LABEL = '(?:fecha\\s*(?:de\\s*)?)?(?:producci[oó]n|fabricaci[oó]n|elaboraci[oó]n|envasado|prod|fab)';

const MONTHS: Record<string, number> = {
  ene: 1, jan: 1, feb: 2, mar: 3, abr: 4, apr: 4, may: 5, jun: 6, jul: 7,
  ago: 8, aug: 8, set: 9, sep: 9, oct: 10, nov: 11, dic: 12, dec: 12,
};

/**
 * Parse the date formats that actually show up on Peruvian certificates:
 * dd/mm/yyyy, dd-mm-yy, yyyy-mm-dd, dd/mmm/yyyy ("15/ENE/2027").
 * Returns ISO yyyy-mm-dd, or undefined when the value isn't a plausible date.
 */
export function parseLooseDate(raw: string): string | undefined {
  const s = (raw ?? '').trim().replace(/\s+/g, '');
  if (!s) return undefined;

  let y: number | undefined, m: number | undefined, d: number | undefined;

  // yyyy-mm-dd / yyyy/mm/dd
  let mt = s.match(/^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})$/);
  if (mt) { y = +mt[1]; m = +mt[2]; d = +mt[3]; }

  // dd-mm-yyyy / dd/mm/yy
  if (!y) {
    mt = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
    if (mt) { d = +mt[1]; m = +mt[2]; y = +mt[3]; }
  }

  // dd-MMM-yyyy
  if (!y) {
    mt = s.match(/^(\d{1,2})[/\-.]([A-Za-zÁÉÍÓÚáéíóú]{3,10})[/\-.](\d{2,4})$/);
    if (mt) {
      d = +mt[1];
      m = MONTHS[mt[2].slice(0, 3).toLowerCase()];
      y = +mt[3];
    }
  }

  if (!y || !m || !d) return undefined;
  if (y < 100) y += 2000;
  if (m < 1 || m > 12 || d < 1 || d > 31) return undefined;
  // Guard against OCR noise producing absurd years.
  if (y < 2000 || y > 2100) return undefined;

  const iso = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const check = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(check.getTime())) return undefined;
  return iso;
}

const DATE_RE = '(\\d{1,2}[/\\-.][A-Za-zÁÉÍÓÚáéíóú0-9]{1,10}[/\\-.]\\d{2,4}|\\d{4}[/\\-.]\\d{1,2}[/\\-.]\\d{1,2})';

/**
 * Pull every lot / expiry / production value out of a certificate's text.
 *
 * Two passes:
 *  1. Line-wise — a row that carries a lot AND a date is one delivery lot; this
 *     is how tabular certificates (one row per lote) read.
 *  2. Document-wise — a certificate for a single lot usually states "Lote: X"
 *     in the header and "Vencimiento: Y" further down. If pass 1 found nothing
 *     usable, pair the first lot with the first expiry.
 */
export function extractLotsFromText(text: string): DetectedLot[] {
  if (!text) return [];
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const out: DetectedLot[] = [];
  const seen = new Set<string>();

  const lotInline  = new RegExp(`${LOT_LABEL}\\s*[:#.\\-]?\\s*([A-Za-z0-9][A-Za-z0-9\\-_/]{1,24})`, 'i');
  const expInline  = new RegExp(`${EXP_LABEL}\\s*[:#.\\-]?\\s*${DATE_RE}`, 'i');
  const prodInline = new RegExp(`${PROD_LABEL}\\s*[:#.\\-]?\\s*${DATE_RE}`, 'i');

  for (const line of lines) {
    const lot  = line.match(lotInline)?.[1];
    const exp  = parseLooseDate(line.match(expInline)?.[1] ?? '');
    const prod = parseLooseDate(line.match(prodInline)?.[1] ?? '');
    if (!lot && !exp) continue;

    // A row with both is a complete lot row. A row with only one is kept too —
    // the document-wise pass below merges the halves.
    const key = `${lot ?? ''}|${exp ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      ...(lot  ? { lotNumber: lot } : {}),
      ...(exp  ? { expiryDate: exp } : {}),
      ...(prod ? { productionDate: prod } : {}),
      rawLine: line.slice(0, 160),
    });
  }

  const complete = out.filter(o => o.lotNumber && o.expiryDate);
  if (complete.length) return complete;

  // Header-style certificate: one lot somewhere, one expiry somewhere else.
  const lot  = out.find(o => o.lotNumber)?.lotNumber;
  const exp  = out.find(o => o.expiryDate)?.expiryDate;
  const prod = out.find(o => o.productionDate)?.productionDate;
  if (lot || exp) {
    return [{
      ...(lot  ? { lotNumber: lot } : {}),
      ...(exp  ? { expiryDate: exp } : {}),
      ...(prod ? { productionDate: prod } : {}),
      rawLine: out[0]?.rawLine,
    }];
  }
  return [];
}

/** Read an uploaded certificate (PDF / image / text) and return its lot rows. */
export async function extractLotsFromAttachment(mimeType: string, dataBase64: string): Promise<DetectedLot[]> {
  try {
    const text = await documentToText(mimeType, dataBase64);
    return extractLotsFromText(text);
  } catch (err) {
    console.error('[cert]', err instanceof Error ? err.message : String(err));
    return [];
  }
}
