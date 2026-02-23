/**
 * notifications/routes.ts
 *
 * POST /webhooks/inbound-email
 *
 * Receives SNS notifications that fire when SES stores a new inbound email
 * in the S3 bucket (victorsdou-docs/incoming/).
 *
 * Flow:
 *   docs@erp.victorsdou.pe
 *     → SES receipt rule (store-docs-to-s3)
 *       → S3: victorsdou-docs/incoming/<messageId>
 *         → S3 event notification → SNS topic
 *           → HTTP subscription → POST /webhooks/inbound-email
 *
 * On each notification:
 *   1. Fetch raw MIME email from S3
 *   2. Parse with mailparser (headers + attachments)
 *   3. If the email has document attachments (PDF / XML / image):
 *      → Create a Comprobante record with source = 'EMAIL'
 *      → Store all attachments as ComprobanteArchivo records
 *      → Kick off background extraction (RUC, totals, dates) for each file
 *
 * The endpoint also handles SNS SubscriptionConfirmation so the topic can
 * be wired up without manual console steps.
 */

import type { FastifyInstance } from 'fastify';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { PrismaClient } from '@prisma/client';
import { simpleParser } from 'mailparser';
import { config } from '../../config';
import {
  autoExtract,
  archivoTipoFromMime,
  guessDocTypeFromFilename,
} from '../comprobantes/extractor';

// ── Singletons ────────────────────────────────────────────────────────────────

const prisma = new PrismaClient();

const s3 = new S3Client({
  region: config.AWS_REGION,
  credentials:
    config.AWS_ACCESS_KEY_ID && config.AWS_SECRET_ACCESS_KEY
      ? { accessKeyId: config.AWS_ACCESS_KEY_ID, secretAccessKey: config.AWS_SECRET_ACCESS_KEY }
      : undefined,
});

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Stream an S3 object body into a Buffer (preserves binary content). */
async function s3ObjectToBuffer(bucket: string, key: string): Promise<Buffer> {
  const resp = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  if (!resp.Body) return Buffer.alloc(0);
  // @ts-ignore — Body is a Readable stream in Node environments
  const chunks: Buffer[] = [];
  for await (const chunk of resp.Body as AsyncIterable<Buffer>) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

/**
 * Decide whether an email attachment is a real document (PDF / XML / image)
 * versus decorative inline content (tiny tracking pixels, HTML boilerplate).
 */
function isDocumentAttachment(att: {
  contentType: string;
  contentDisposition?: string | null;
  size?: number;
  content: Buffer;
}): boolean {
  const mime = att.contentType.toLowerCase();
  const size = att.size ?? att.content.length;
  if (size < 512) return false; // too small to be a real document
  if (mime === 'application/pdf')  return true;
  if (mime.includes('xml'))        return true;
  if (mime.startsWith('image/'))   return att.contentDisposition === 'attachment' || size > 10_000;
  return false;
}

// ── Route ─────────────────────────────────────────────────────────────────────

export async function notificationsWebhookRoutes(app: FastifyInstance) {

  /**
   * POST /webhooks/inbound-email
   *
   * SNS sends a JSON body with a `Type` field:
   *   - "SubscriptionConfirmation"  → follow the SubscribeURL to confirm
   *   - "Notification"              → process the S3 Put event
   */
  app.post('/inbound-email', async (req, reply) => {
    const msgType = (req.headers['x-amz-sns-message-type'] ?? '') as string;

    let body: any;
    try {
      body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    } catch {
      return reply.code(400).send({ error: 'INVALID_JSON' });
    }

    // ── Subscription confirmation ────────────────────────────────────────────
    if (msgType === 'SubscriptionConfirmation' || body?.Type === 'SubscriptionConfirmation') {
      const subscribeUrl = body?.SubscribeURL as string | undefined;
      if (subscribeUrl) {
        try {
          await fetch(subscribeUrl);
          app.log.info({ subscribeUrl }, '[inbound-email] SNS subscription confirmed');
        } catch (err) {
          app.log.error({ err, subscribeUrl }, '[inbound-email] Failed to confirm SNS subscription');
        }
      }
      return reply.send({ confirmed: true });
    }

    // ── S3 event notification ────────────────────────────────────────────────
    if (msgType === 'Notification' || body?.Type === 'Notification') {
      let message: any;
      try {
        message = typeof body.Message === 'string' ? JSON.parse(body.Message) : body.Message;
      } catch {
        app.log.warn({ body }, '[inbound-email] Could not parse SNS Message');
        return reply.send({ received: true });
      }

      const records: any[] = message?.Records ?? [];

      for (const record of records) {
        const bucket = record?.s3?.bucket?.name as string | undefined;
        const key    = decodeURIComponent((record?.s3?.object?.key as string | undefined) ?? '');

        if (!bucket || !key) continue;

        app.log.info({ bucket, key }, '[inbound-email] New inbound email stored in S3');

        try {
          // ── 1. Fetch raw email from S3 ─────────────────────────────────────
          const rawBuffer = await s3ObjectToBuffer(bucket, key);

          // ── 2. Parse MIME ──────────────────────────────────────────────────
          const parsed = await simpleParser(rawBuffer, { skipTextToHtml: true });

          const fromText   = parsed.from?.text ?? 'desconocido';
          const toText     = Array.isArray(parsed.to) ? parsed.to.map((a: any) => a.text).join(', ') : (parsed.to?.text ?? '');
          const subject    = parsed.subject    ?? '(sin asunto)';
          const allAttachments = parsed.attachments ?? [];

          app.log.info(
            { from: fromText, to: toText, subject, attachmentCount: allAttachments.length, s3Key: key },
            '[inbound-email] Parsed inbound email',
          );

          // ── 3. Filter to document attachments only ─────────────────────────
          const docAttachments = allAttachments.filter(isDocumentAttachment);

          if (docAttachments.length === 0) {
            app.log.info(
              { s3Key: key, subject, from: fromText },
              '[inbound-email] No document attachments — no Comprobante created',
            );
            continue;
          }

          // ── 4. Create Comprobante record ───────────────────────────────────
          const comprobante = await prisma.comprobante.create({
            data: {
              descripcion:  subject,
              fecha:        new Date(),   // refined by extraction below
              moneda:       'PEN',
              source:       'EMAIL' as any,
              senderEmail:  fromText,
              emailSubject: subject,
              createdBy:    fromText,
              archivos: {
                create: docAttachments.map((att) => ({
                  docType:       guessDocTypeFromFilename(att.filename ?? 'documento'),
                  archivoTipo:   archivoTipoFromMime(att.contentType),
                  nombreArchivo: att.filename ?? `attachment_${Date.now()}`,
                  mimeType:      att.contentType,
                  tamanoBytes:   att.size ?? att.content.length,
                  dataBase64:    att.content.toString('base64'),
                })),
              },
            } as any,
            select: { id: true },
          });

          app.log.info(
            { comprobanteId: comprobante.id, from: fromText, subject, files: docAttachments.length },
            '[inbound-email] Comprobante created — starting background extraction',
          );

          // ── 5. Background extraction (fire-and-forget) ────────────────────
          // We return 200 to SNS immediately, then do the slow extraction work
          // (especially OCR for images) asynchronously in the background.
          void (async () => {
            try {
              const archivos = await prisma.comprobanteArchivo.findMany({
                where:  { comprobanteId: comprobante.id },
                select: { id: true, mimeType: true, dataBase64: true },
              });

              let bestDate:  Date    | undefined;
              let bestTotal: number  | undefined;
              let bestMoneda: string | undefined;

              for (const arch of archivos) {
                try {
                  const extracted = await autoExtract(arch.mimeType, arch.dataBase64);

                  if (Object.keys(extracted).length > 0) {
                    await prisma.comprobanteArchivo.update({
                      where: { id: arch.id },
                      data:  extracted as any,
                    });
                  }

                  // Track best metadata values to update parent Comprobante
                  if (extracted.fechaEmision && !bestDate)  bestDate   = extracted.fechaEmision;
                  if (extracted.total        && !bestTotal) bestTotal  = extracted.total;
                  if (extracted.monedaDoc    && !bestMoneda) bestMoneda = extracted.monedaDoc;

                } catch (err) {
                  app.log.warn({ err, archivoId: arch.id }, '[inbound-email] Archivo extraction failed');
                }
              }

              // Update parent Comprobante with refined metadata
              const updates: Record<string, unknown> = {};
              if (bestDate)   updates.fecha      = bestDate;
              if (bestTotal)  updates.montoTotal  = bestTotal;
              if (bestMoneda) updates.moneda      = bestMoneda;

              if (Object.keys(updates).length > 0) {
                await prisma.comprobante.update({
                  where: { id: comprobante.id },
                  data:  updates,
                }).catch(() => { /* ignore if already updated */ });
              }

              app.log.info(
                { comprobanteId: comprobante.id },
                '[inbound-email] Background extraction complete',
              );

            } catch (err) {
              app.log.error({ err, comprobanteId: comprobante.id }, '[inbound-email] Background extraction error');
            }
          })();

        } catch (err) {
          app.log.error({ err, bucket, key }, '[inbound-email] Failed to process email from S3');
        }
      }

      return reply.send({ received: true });
    }

    // Unknown message type — still return 200 so SNS doesn't retry
    app.log.warn({ type: body?.Type, msgType }, '[inbound-email] Unknown SNS message type — ignored');
    return reply.send({ received: true });
  });
}
