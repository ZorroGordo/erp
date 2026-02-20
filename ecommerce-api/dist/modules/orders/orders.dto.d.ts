import { z } from 'zod';
export declare const UpdateOrderStatusSchema: z.ZodObject<{
    status: z.ZodEnum<{
        CANCELLED: "CANCELLED";
        PENDING_PAYMENT: "PENDING_PAYMENT";
        PAID: "PAID";
        CONFIRMED: "CONFIRMED";
        PREPARING: "PREPARING";
        OUT_FOR_DELIVERY: "OUT_FOR_DELIVERY";
        DELIVERED: "DELIVERED";
        REFUNDED: "REFUNDED";
    }>;
    note: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type UpdateOrderStatusDto = z.infer<typeof UpdateOrderStatusSchema>;
export declare const ListOrdersQuerySchema: z.ZodObject<{
    page: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
    limit: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
    status: z.ZodOptional<z.ZodEnum<{
        CANCELLED: "CANCELLED";
        PENDING_PAYMENT: "PENDING_PAYMENT";
        PAID: "PAID";
        CONFIRMED: "CONFIRMED";
        PREPARING: "PREPARING";
        OUT_FOR_DELIVERY: "OUT_FOR_DELIVERY";
        DELIVERED: "DELIVERED";
        REFUNDED: "REFUNDED";
    }>>;
}, z.core.$strip>;
export type ListOrdersQueryDto = z.infer<typeof ListOrdersQuerySchema>;
