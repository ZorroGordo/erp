"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MergeCartSchema = exports.UpdateCartItemSchema = exports.AddToCartSchema = void 0;
const zod_1 = require("zod");
exports.AddToCartSchema = zod_1.z.object({
    erpProductId: zod_1.z.string().uuid(),
    qty: zod_1.z.number().int().min(1).max(999),
});
exports.UpdateCartItemSchema = zod_1.z.object({
    qty: zod_1.z.number().int().min(0).max(999),
});
exports.MergeCartSchema = zod_1.z.object({
    guestToken: zod_1.z.string().min(1),
});
//# sourceMappingURL=cart.dto.js.map