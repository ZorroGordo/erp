import { z } from 'zod';

// ─── Update order status (admin) ──────────────────────────────────────────────

export const UpdateOrderStatusSchema = z.object({
  status: z.enum([
    'PENDING_PAYMENT',
    'PAID',
    'CONFIRMED',
    'PREPARING',
    'OUT_FOR_DELIVERY',
    'DELIVERED',
    'CANCELLED',
    'REFUNDED',
  ]),
  note:  z.string().max(255).optional(),
});
export type UpdateOrderStatusDto = z.infer<typeof UpdateOrderStatusSchema>;

// ─── List orders query ────────────────────────────────────────────────────────

export const ListOrdersQuerySchema = z.object({
  page:   z.coerce.number().int().min(1).default(1),
  limit:  z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum([
    'PENDING_PAYMENT', 'PAID', 'CONFIRMED', 'PREPARING',
    'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED', 'REFUNDED',
  ]).optional(),
});
export type ListOrdersQueryDto = z.infer<typeof ListOrdersQuerySchema>;
