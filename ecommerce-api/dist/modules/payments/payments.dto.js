"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebhookSchema = exports.ChargeSchema = void 0;
const zod_1 = require("zod");
exports.ChargeSchema = zod_1.z.object({
    orderId: zod_1.z.string().uuid(),
    culqiToken: zod_1.z.string().min(1),
    email: zod_1.z.string().email(),
});
exports.WebhookSchema = zod_1.z.object({
    type: zod_1.z.string(),
    data: zod_1.z.object({
        object: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()),
    }),
});
//# sourceMappingURL=payments.dto.js.map