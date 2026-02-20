import { z } from 'zod';

// ─── Charge (frontend sends token from Culqi.js) ──────────────────────────────

export const ChargeSchema = z.object({
  orderId:    z.string().uuid(),
  culqiToken: z.string().min(1),   // chr_xxx token from Culqi.js
  email:      z.string().email(),  // required by Culqi
});
export type ChargeDto = z.infer<typeof ChargeSchema>;

// ─── Culqi webhook payload (minimal — we verify signature + status) ───────────

export const WebhookSchema = z.object({
  type: z.string(),
  data: z.object({
    object: z.record(z.string(), z.unknown()),
  }),
});
export type WebhookDto = z.infer<typeof WebhookSchema>;
