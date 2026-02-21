/**
 * notifications.ts
 *
 * Thin wrappers around AWS SES (email) and SNS (SMS), plus
 * domain-level helpers that know what to send for each business event.
 *
 * All public functions are fire-and-forget-safe: they never throw;
 * failures are logged to stderr.
 */

import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import { config } from '../config';

// ── AWS clients ───────────────────────────────────────────────────────────────

function makeCredentials() {
  if (config.AWS_ACCESS_KEY_ID && config.AWS_SECRET_ACCESS_KEY) {
    return {
      accessKeyId:     config.AWS_ACCESS_KEY_ID,
      secretAccessKey: config.AWS_SECRET_ACCESS_KEY,
    };
  }
  return undefined;   // fall back to IAM role / instance profile
}

const ses = new SESClient({ region: config.AWS_REGION, credentials: makeCredentials() });
const sns = new SNSClient({ region: config.AWS_REGION, credentials: makeCredentials() });

// ── Low-level primitives ──────────────────────────────────────────────────────

/** Send a plain-text (+ optional HTML) email via SES. Never throws. */
export async function sendEmail(opts: {
  to: string | string[];
  subject: string;
  text: string;
  html?: string;
}): Promise<void> {
  const toAddresses = Array.isArray(opts.to) ? opts.to : [opts.to];
  try {
    await ses.send(
      new SendEmailCommand({
        Source:      config.SES_FROM_EMAIL,
        Destination: { ToAddresses: toAddresses },
        Message: {
          Subject: { Data: opts.subject, Charset: 'UTF-8' },
          Body: {
            Text: { Data: opts.text, Charset: 'UTF-8' },
            ...(opts.html ? { Html: { Data: opts.html, Charset: 'UTF-8' } } : {}),
          },
        },
      }),
    );
    console.log(`[notifications] email sent → ${toAddresses.join(', ')} | ${opts.subject}`);
  } catch (err) {
    console.error('[notifications] sendEmail failed:', err);
  }
}

/** Send an SMS via SNS direct-publish. Never throws. */
export async function sendSMS(phoneNumber: string, message: string): Promise<void> {
  if (!phoneNumber) return;
  try {
    await sns.send(
      new PublishCommand({
        PhoneNumber: phoneNumber,
        Message:     message,
        MessageAttributes: {
          'AWS.SNS.SMS.SMSType':  { DataType: 'String', StringValue: 'Transactional' },
          'AWS.SNS.SMS.SenderID': { DataType: 'String', StringValue: 'VictorERP' },
        },
      }),
    );
    console.log(`[notifications] SMS sent → ${phoneNumber}`);
  } catch (err) {
    console.error('[notifications] sendSMS failed:', err);
  }
}

// ── Domain-level helpers ──────────────────────────────────────────────────────

/**
 * Fires when an invoice is accepted by SUNAT.
 * Emails the client their comprobante and SMSes ops.
 */
export async function notifyInvoiceEmitted(invoice: {
  series:       string;
  correlative:  string;
  entityName:   string;
  entityEmail?: string | null;
  totalPen:     number | string;
  pdfUrl?:      string | null;
}): Promise<void> {
  const ref     = `${invoice.series}-${invoice.correlative}`;
  const amount  = `S/ ${Number(invoice.totalPen).toFixed(2)}`;
  const subject = `Comprobante ${ref} – ${config.COMPANY_NAME}`;

  const textLines = [
    `Estimado/a ${invoice.entityName},`,
    '',
    `Le comunicamos que su comprobante de pago ${ref} por ${amount} ha sido aceptado por SUNAT.`,
    invoice.pdfUrl ? `Puede descargar su comprobante aquí: ${invoice.pdfUrl}` : '',
    '',
    `Gracias por su preferencia.`,
    config.COMPANY_NAME,
  ].filter(l => l !== '');

  const promises: Promise<void>[] = [];

  if (invoice.entityEmail) {
    promises.push(sendEmail({ to: invoice.entityEmail, subject, text: textLines.join('\n') }));
  }

  if (config.OPS_ALERT_PHONE) {
    promises.push(
      sendSMS(config.OPS_ALERT_PHONE, `[ERP] Comprobante ${ref} emitido → ${invoice.entityName} | ${amount}`),
    );
  }

  await Promise.allSettled(promises);
}

/**
 * Fires when a Purchase Order is created.
 * Emails the supplier and SMSes ops.
 */
export async function notifyPurchaseOrderCreated(po: {
  poNumber:  string;
  totalPen:  number | string;
  supplier:  { businessName: string; email?: string | null };
}): Promise<void> {
  const amount  = `S/ ${Number(po.totalPen).toFixed(2)}`;
  const subject = `Orden de Compra ${po.poNumber} – ${config.COMPANY_NAME}`;

  const text = [
    `Estimado/a ${po.supplier.businessName},`,
    '',
    `Le comunicamos que hemos generado la Orden de Compra ${po.poNumber} por un total de ${amount}.`,
    `Nuestro equipo de compras se pondrá en contacto para coordinar la entrega.`,
    '',
    `Saludos,`,
    config.COMPANY_NAME,
  ].join('\n');

  const promises: Promise<void>[] = [];

  if (po.supplier.email) {
    promises.push(sendEmail({ to: po.supplier.email, subject, text }));
  }

  if (config.OPS_ALERT_PHONE) {
    promises.push(
      sendSMS(config.OPS_ALERT_PHONE, `[ERP] OC ${po.poNumber} creada → ${po.supplier.businessName} | ${amount}`),
    );
  }

  await Promise.allSettled(promises);
}

/**
 * Fires when a Sales Order is confirmed.
 * Emails the customer and SMSes ops.
 */
export async function notifySalesOrderConfirmed(order: {
  orderNumber: string;
  totalPen:    number | string;
  customer: {
    businessName?: string | null;
    contactName?:  string | null;
    email?:        string | null;
  };
}): Promise<void> {
  const recipientName = order.customer.businessName ?? order.customer.contactName ?? 'Cliente';
  const amount        = `S/ ${Number(order.totalPen).toFixed(2)}`;
  const subject       = `Pedido ${order.orderNumber} confirmado – ${config.COMPANY_NAME}`;

  const text = [
    `Estimado/a ${recipientName},`,
    '',
    `Su pedido ${order.orderNumber} ha sido confirmado por un total de ${amount}.`,
    `Nos pondremos en contacto para coordinar la entrega.`,
    '',
    `Gracias por su preferencia.`,
    config.COMPANY_NAME,
  ].join('\n');

  const promises: Promise<void>[] = [];

  if (order.customer.email) {
    promises.push(sendEmail({ to: order.customer.email, subject, text }));
  }

  if (config.OPS_ALERT_PHONE) {
    promises.push(
      sendSMS(config.OPS_ALERT_PHONE, `[ERP] Pedido ${order.orderNumber} confirmado → ${recipientName} | ${amount}`),
    );
  }

  await Promise.allSettled(promises);
}

/**
 * Fires when one or more ingredients drop below their reorder threshold.
 * SMSes ops only (no client email needed for internal stock alerts).
 */
export async function alertLowStock(items: {
  name:           string;
  currentQty:     number;
  alertThreshold: number;
  baseUom:        string;
}[]): Promise<void> {
  if (!config.OPS_ALERT_PHONE || items.length === 0) return;

  const lines   = items.map(i => `• ${i.name}: ${i.currentQty} ${i.baseUom} (mín ${i.alertThreshold})`);
  const message = `[ERP] ⚠ Stock bajo:\n${lines.join('\n')}`;

  await sendSMS(config.OPS_ALERT_PHONE, message);
}
