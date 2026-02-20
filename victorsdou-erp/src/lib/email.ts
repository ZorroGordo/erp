/**
 * lib/email.ts
 * Email dispatcher via Amazon SES (AWS SDK v3).
 * Falls back to console.log if AWS credentials are not configured.
 */

import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { config } from '../config';

// Lazy-initialise SES client only when credentials are present
let _ses: SESClient | null = null;
function getSES(): SESClient | null {
  if (!config.AWS_ACCESS_KEY_ID || !config.AWS_SECRET_ACCESS_KEY) return null;
  if (!_ses) {
    _ses = new SESClient({
      region: config.AWS_REGION,
      credentials: {
        accessKeyId:     config.AWS_ACCESS_KEY_ID,
        secretAccessKey: config.AWS_SECRET_ACCESS_KEY,
      },
    });
  }
  return _ses;
}

export interface EmailMessage {
  to:      string | string[];
  subject: string;
  html:    string;
  text?:   string;
}

export async function sendEmail(msg: EmailMessage): Promise<void> {
  const recipients = Array.isArray(msg.to) ? msg.to : [msg.to];
  if (!recipients.length) return;

  const ses = getSES();
  if (!ses) {
    // No AWS credentials configured — log instead of sending
    console.log('[Email] (no AWS SES config) Would send to:', recipients.join(', '));
    console.log('[Email] Subject:', msg.subject);
    return;
  }

  const command = new SendEmailCommand({
    Source: config.SES_FROM_EMAIL,
    Destination: { ToAddresses: recipients },
    Message: {
      Subject: { Data: msg.subject, Charset: 'UTF-8' },
      Body: {
        Html: { Data: msg.html,        Charset: 'UTF-8' },
        ...(msg.text ? { Text: { Data: msg.text, Charset: 'UTF-8' } } : {}),
      },
    },
  });

  try {
    await ses.send(command);
  } catch (err) {
    console.error('[Email] SES error:', err);
  }
}

// ── Stock alert email templates ───────────────────────────────────────────────

export function buildStockAlertEmail(opts: {
  ingredientName: string;
  qtyAvailable:   number;
  uom:            string;
  level:          'alert' | 'critical';
  threshold:      number;
}) {
  const levelLabel     = opts.level === 'critical' ? '🔴 CRÍTICO' : '🟡 ALERTA';
  const thresholdLabel = opts.level === 'critical' ? 'mínimo absoluto' : 'umbral de alerta';

  const subject = `${levelLabel} — Bajo stock: ${opts.ingredientName}`;
  const html = `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;">
      <div style="background:${opts.level === 'critical' ? '#fef2f2' : '#fffbeb'};
                  border-left:4px solid ${opts.level === 'critical' ? '#ef4444' : '#f59e0b'};
                  padding:16px 20px;border-radius:8px;">
        <h2 style="margin:0 0 8px;color:${opts.level === 'critical' ? '#991b1b' : '#92400e'};">
          ${levelLabel} — Bajo stock
        </h2>
        <p style="margin:0;color:#374151;">
          <strong>${opts.ingredientName}</strong> tiene actualmente
          <strong>${opts.qtyAvailable.toFixed(2)} ${opts.uom}</strong>
          disponibles, lo cual está por debajo del ${thresholdLabel}
          (<strong>${opts.threshold.toFixed(2)} ${opts.uom}</strong>).
        </p>
      </div>
      <p style="color:#6b7280;font-size:13px;margin-top:16px;">
        Este aviso fue enviado automáticamente por VictorOS ERP.
        Accede al módulo de Inventario para registrar una nueva entrada.
      </p>
    </div>
  `;

  return { subject, html };
}
