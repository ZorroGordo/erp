/**
 * notifications/routes.ts
 *
 * POST /webhooks/inbound-email
 *
 * Receives SNS notifications that fire when SES stores a new inbound email
 * in the S3 bucket (victorsdou-docs/incoming/).
 *
 * Flow:
 *   docs@victorsdou.pe
 *     → SES receipt rule (store-docs-to-s3)
 *       → S3: victorsdou-docs/incoming/<messageId>
 *         → S3 event notification → SNS topic
 *           → HTTP subscription → POST /webhooks/inbound-email
 *
 * The endpoint also handles SNS SubscriptionConfirmation so the topic can
 * be wired up without manual console steps.
 */

import type { FastifyInstance } from 'fastify';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { config } from '../../config';

// ── S3 client (for fetching raw emails) ─────────────────────────────────────

const s3 = new S3Client({
  region: config.AWS_REGION,
  credentials:
    config.AWS_ACCESS_KEY_ID && config.AWS_SECRET_ACCESS_KEY
      ? { accessKeyId: config.AWS_ACCESS_KEY_ID, secretAccessKey: config.AWS_SECRET_ACCESS_KEY }
      : undefined,
});

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Stream an S3 object body to a UTF-8 string. */
async function s3ObjectToString(bucket: string, key: string): Promise<string> {
  const resp = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  if (!resp.Body) return '';
  // @ts-ignore — Body is a Readable stream in Node environments
  const chunks: Buffer[] = [];
  for await (const chunk of resp.Body as AsyncIterable<Buffer>) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf-8');
}

/** Very light email header parser — no external deps needed. */
function parseEmailHeaders(raw: string): { from: string; to: string; subject: string; date: string } {
  const headers: Record<string, string> = {};
  const lines = raw.split(/\r?\n/);
  let i = 0;
  while (i < lines.length && lines[i] !== '') {
    const line = lines[i];
    if (/^\s/.test(line) && Object.keys(headers).length > 0) {
      // continuation line — append to last header value
      const last = Object.keys(headers).pop()!;
      headers[last] += ' ' + line.trim();
    } else {
      const colon = line.indexOf(':');
      if (colon > 0) {
        const key   = line.slice(0, colon).toLowerCase().trim();
        const value = line.slice(colon + 1).trim();
        headers[key] = value;
      }
    }
    i++;
  }
  return {
    from:    headers['from']    ?? '',
    to:      headers['to']      ?? '',
    subject: headers['subject'] ?? '(no subject)',
    date:    headers['date']    ?? new Date().toISOString(),
  };
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
    // SNS sets this header; accept both values
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

        // Fetch and parse the raw email (best-effort; failures don't block response)
        try {
          const raw     = await s3ObjectToString(bucket, key);
          const headers = parseEmailHeaders(raw);

          app.log.info(
            { from: headers.from, to: headers.to, subject: headers.subject, s3Key: key },
            '[inbound-email] Parsed inbound email',
          );

          // TODO: persist to DB (InboundEmail table) and trigger any downstream
          //       workflows (e.g. auto-attach PDF to a PO, trigger AP matching).
          //
          // Example (uncomment once the Prisma model exists):
          //   await prisma.inboundEmail.create({
          //     data: {
          //       s3Bucket: bucket,
          //       s3Key:    key,
          //       fromAddr: headers.from,
          //       toAddr:   headers.to,
          //       subject:  headers.subject,
          //       receivedAt: new Date(headers.date),
          //     },
          //   });

        } catch (err) {
          app.log.error({ err, bucket, key }, '[inbound-email] Failed to fetch/parse email from S3');
        }
      }

      return reply.send({ received: true });
    }

    // Unknown message type — still return 200 so SNS doesn't retry
    app.log.warn({ type: body?.Type, msgType }, '[inbound-email] Unknown SNS message type — ignored');
    return reply.send({ received: true });
  });
}
