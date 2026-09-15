// ── ¿Este correo entrante es una cotización? ─────────────────────────────────
//
// All inbound mail lands on the same SES → S3 → SNS webhook, so the routing
// decision is made here rather than in AWS. Two independent signals, either of
// which is enough:
//
//   1. the recipient is one of the purchasing mailboxes (QUOTES_INBOX), or
//   2. the subject or an attachment's filename says "cotización" / "proforma" /
//      "quotation" (QUOTES_SUBJECT_KEYWORDS).
//
// (2) exists so the flow works on day one without touching DNS or the SES
// receipt rules: a supplier can keep writing to the mailbox that already has a
// rule, and a quote still reaches the purchasing flow. Everything that matches
// neither signal is registered as a comprobante, exactly as before.

import { config } from '../../config';

const strip = (v: string) =>
  (v ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

const listOf = (raw: string) =>
  (raw ?? '').split(',').map(s => strip(s).trim()).filter(Boolean);

export type QuoteMatch = { esCotizacion: boolean; motivo: 'buzon' | 'asunto' | 'adjunto' | null };

export function clasificarCorreo(input: {
  to?: string | null;
  subject?: string | null;
  filenames?: (string | null | undefined)[];
}): QuoteMatch {
  const to       = strip(input.to ?? '');
  const subject  = strip(input.subject ?? '');
  const archivos = (input.filenames ?? []).map(f => strip(f ?? ''));

  for (const inbox of listOf(config.QUOTES_INBOX)) {
    if (inbox && to.includes(inbox)) return { esCotizacion: true, motivo: 'buzon' };
  }

  const keywords = listOf(config.QUOTES_SUBJECT_KEYWORDS);
  for (const k of keywords) {
    if (k && subject.includes(k)) return { esCotizacion: true, motivo: 'asunto' };
  }
  for (const k of keywords) {
    if (k && archivos.some(f => f.includes(k))) return { esCotizacion: true, motivo: 'adjunto' };
  }

  return { esCotizacion: false, motivo: null };
}
