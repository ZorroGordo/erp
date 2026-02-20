import { z } from 'zod';
export declare const ChargeSchema: z.ZodObject<{
    orderId: z.ZodString;
    culqiToken: z.ZodString;
    email: z.ZodString;
}, z.core.$strip>;
export type ChargeDto = z.infer<typeof ChargeSchema>;
export declare const WebhookSchema: z.ZodObject<{
    type: z.ZodString;
    data: z.ZodObject<{
        object: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    }, z.core.$strip>;
}, z.core.$strip>;
export type WebhookDto = z.infer<typeof WebhookSchema>;
