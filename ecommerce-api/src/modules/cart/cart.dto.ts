import { z } from 'zod';

export const AddToCartSchema = z.object({
  erpProductId: z.string().uuid(),
  qty:          z.number().int().min(1).max(999),
});
export type AddToCartDto = z.infer<typeof AddToCartSchema>;

export const UpdateCartItemSchema = z.object({
  qty: z.number().int().min(0).max(999),   // 0 = remove
});
export type UpdateCartItemDto = z.infer<typeof UpdateCartItemSchema>;

export const MergeCartSchema = z.object({
  guestToken: z.string().min(1),
});
export type MergeCartDto = z.infer<typeof MergeCartSchema>;
