import { z } from 'zod';

// ─── Available slots query ────────────────────────────────────────────────────

export const GetSlotsSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD'),
  to:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD'),
});
export type GetSlotsDto = z.infer<typeof GetSlotsSchema>;

// ─── Validate cart ────────────────────────────────────────────────────────────

export const ValidateCartSchema = z.object({
  deliveryDate:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  deliveryWindow: z.enum(['MORNING', 'AFTERNOON']),
});
export type ValidateCartDto = z.infer<typeof ValidateCartSchema>;

// ─── Initiate checkout ────────────────────────────────────────────────────────

export const InitiateCheckoutSchema = z.object({
  deliveryDate:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  deliveryWindow: z.enum(['MORNING', 'AFTERNOON']),

  // Shipping address — one of: saved addressId or inline address
  addressId:      z.string().uuid().optional(),
  inlineAddress:  z.object({
    label:        z.string().min(1).max(50),
    addressLine1: z.string().min(5).max(255),
    addressLine2: z.string().max(100).optional(),
    district:     z.string().min(1).max(100),
    province:     z.string().max(100).optional(),
    department:   z.string().max(100).optional(),
  }).optional(),

  // Guest contact (required if not authenticated)
  guestEmail:     z.string().email().optional(),
  guestPhone:     z.string().max(30).optional(),

  notes:          z.string().max(500).optional(),
  promoCode:      z.string().max(50).optional(),
}).refine(
  (d) => d.addressId || d.inlineAddress,
  { message: 'Provide either addressId or inlineAddress' },
);
export type InitiateCheckoutDto = z.infer<typeof InitiateCheckoutSchema>;
