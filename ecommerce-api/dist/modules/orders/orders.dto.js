"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ListOrdersQuerySchema = exports.UpdateOrderStatusSchema = void 0;
const zod_1 = require("zod");
exports.UpdateOrderStatusSchema = zod_1.z.object({
    status: zod_1.z.enum([
        'PENDING_PAYMENT',
        'PAID',
        'CONFIRMED',
        'PREPARING',
        'OUT_FOR_DELIVERY',
        'DELIVERED',
        'CANCELLED',
        'REFUNDED',
    ]),
    note: zod_1.z.string().max(255).optional(),
});
exports.ListOrdersQuerySchema = zod_1.z.object({
    page: zod_1.z.coerce.number().int().min(1).default(1),
    limit: zod_1.z.coerce.number().int().min(1).max(100).default(20),
    status: zod_1.z.enum([
        'PENDING_PAYMENT', 'PAID', 'CONFIRMED', 'PREPARING',
        'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED', 'REFUNDED',
    ]).optional(),
});
//# sourceMappingURL=orders.dto.js.map