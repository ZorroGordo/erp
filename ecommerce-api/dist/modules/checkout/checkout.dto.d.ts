import { z } from 'zod';
export declare const GetSlotsSchema: z.ZodObject<{
    from: z.ZodString;
    to: z.ZodString;
}, z.core.$strip>;
export type GetSlotsDto = z.infer<typeof GetSlotsSchema>;
export declare const ValidateCartSchema: z.ZodObject<{
    deliveryDate: z.ZodString;
    deliveryWindow: z.ZodEnum<{
        MORNING: "MORNING";
        AFTERNOON: "AFTERNOON";
    }>;
}, z.core.$strip>;
export type ValidateCartDto = z.infer<typeof ValidateCartSchema>;
export declare const InitiateCheckoutSchema: z.ZodObject<{
    deliveryDate: z.ZodString;
    deliveryWindow: z.ZodEnum<{
        MORNING: "MORNING";
        AFTERNOON: "AFTERNOON";
    }>;
    addressId: z.ZodOptional<z.ZodString>;
    inlineAddress: z.ZodOptional<z.ZodObject<{
        label: z.ZodString;
        addressLine1: z.ZodString;
        addressLine2: z.ZodOptional<z.ZodString>;
        district: z.ZodString;
        province: z.ZodOptional<z.ZodString>;
        department: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
    guestEmail: z.ZodOptional<z.ZodString>;
    guestPhone: z.ZodOptional<z.ZodString>;
    notes: z.ZodOptional<z.ZodString>;
    promoCode: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type InitiateCheckoutDto = z.infer<typeof InitiateCheckoutSchema>;
