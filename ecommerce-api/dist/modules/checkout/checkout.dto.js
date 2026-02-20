"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InitiateCheckoutSchema = exports.ValidateCartSchema = exports.GetSlotsSchema = void 0;
const zod_1 = require("zod");
exports.GetSlotsSchema = zod_1.z.object({
    from: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD'),
    to: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD'),
});
exports.ValidateCartSchema = zod_1.z.object({
    deliveryDate: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    deliveryWindow: zod_1.z.enum(['MORNING', 'AFTERNOON']),
});
exports.InitiateCheckoutSchema = zod_1.z.object({
    deliveryDate: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    deliveryWindow: zod_1.z.enum(['MORNING', 'AFTERNOON']),
    addressId: zod_1.z.string().uuid().optional(),
    inlineAddress: zod_1.z.object({
        label: zod_1.z.string().min(1).max(50),
        addressLine1: zod_1.z.string().min(5).max(255),
        addressLine2: zod_1.z.string().max(100).optional(),
        district: zod_1.z.string().min(1).max(100),
        province: zod_1.z.string().max(100).optional(),
        department: zod_1.z.string().max(100).optional(),
    }).optional(),
    guestEmail: zod_1.z.string().email().optional(),
    guestPhone: zod_1.z.string().max(30).optional(),
    notes: zod_1.z.string().max(500).optional(),
    promoCode: zod_1.z.string().max(50).optional(),
}).refine((d) => d.addressId || d.inlineAddress, { message: 'Provide either addressId or inlineAddress' });
//# sourceMappingURL=checkout.dto.js.map