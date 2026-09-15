// ── ¿Este correo entrante es una cotización? ─────────────────────────────────
//
// The SES receipt rule matches the whole erp.victorsdou.pe domain and writes
// every message to s3://victorsdou-docs/incoming/, which notifies SNS, which
// calls the inbound webhook. So ALL inbound mail arrives here regardless of the
// address, and the routing decision belongs in code rather than in AWS —
// compras@erp.victorsdou.pe needs no new rule, no new DNS.
//
// Two signals, either of which is enough:
//
//   1. the recipient is one of the purchasing mailboxes (QUOTES_INBOX), or
//   2. the subject or an attachment's filename says "cotización" / "proforma" /
//      "quotation" (QUOTES_SUBJECT_KEYWORDS).
//
// (2) catches a quote a supplier sent to whatever address they had on file. It
// deliberately does NOT apply to DOCS_INBOX: that mailbox is already in daily
// use for comprobantes, and silently rerouting a document out of it because of
// a word in the subject is a behaviour change nobody asked for.
//
// Everything that matches neither signal is registered as a comprobante,
// exactly as before.

import { config } from '../../config';

const strip = (v: string) =>
  (v ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

const listOf = (raw: string) =>
  (raw ?? '').split(',').map(s => strip(s).trim()).filter(Boolean);

export type QuoteMatch = {
  esCotizacion: boolean;
  motivo: 'buzon' | 'asunto' | 'adjunto' | null;
};

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

  // The comprobantes mailbox is never reclassified by subject.
  for (const inbox of listOf(config.DOCS_INBOX)) {
    if (inbox && to.includes(inbox)) return { esCotizacion: false, motivo: null };
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
