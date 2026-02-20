import { z } from 'zod';
export declare const AddToCartSchema: z.ZodObject<{
    erpProductId: z.ZodString;
    qty: z.ZodNumber;
}, z.core.$strip>;
export type AddToCartDto = z.infer<typeof AddToCartSchema>;
export declare const UpdateCartItemSchema: z.ZodObject<{
    qty: z.ZodNumber;
}, z.core.$strip>;
export type UpdateCartItemDto = z.infer<typeof UpdateCartItemSchema>;
export declare const MergeCartSchema: z.ZodObject<{
    guestToken: z.ZodString;
}, z.core.$strip>;
export type MergeCartDto = z.infer<typeof MergeCartSchema>;
