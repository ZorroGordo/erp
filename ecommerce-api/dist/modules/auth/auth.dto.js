"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UpdateProfileSchema = exports.ResetPasswordSchema = exports.ForgotPasswordSchema = exports.VerifyEmailSchema = exports.GuestSchema = exports.RefreshSchema = exports.LoginSchema = exports.RegisterSchema = void 0;
const zod_1 = require("zod");
exports.RegisterSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(8, 'Password must be at least 8 characters'),
    fullName: zod_1.z.string().min(2).max(255),
    phone: zod_1.z.string().optional(),
    docType: zod_1.z.enum(['DNI', 'RUC', 'CE', 'PASAPORTE']).optional(),
    docNumber: zod_1.z.string().optional(),
    type: zod_1.z.enum(['B2C', 'B2B']).default('B2C'),
    cfTurnstileToken: zod_1.z.string().optional(),
});
exports.LoginSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(1),
    cfTurnstileToken: zod_1.z.string().optional(),
});
exports.RefreshSchema = zod_1.z.object({
    refreshToken: zod_1.z.string().min(1),
});
exports.GuestSchema = zod_1.z.object({
    email: zod_1.z.string().email().optional(),
    fullName: zod_1.z.string().optional(),
});
exports.VerifyEmailSchema = zod_1.z.object({ token: zod_1.z.string().min(1) });
exports.ForgotPasswordSchema = zod_1.z.object({ email: zod_1.z.string().email() });
exports.ResetPasswordSchema = zod_1.z.object({
    token: zod_1.z.string().min(1),
    password: zod_1.z.string().min(8),
});
exports.UpdateProfileSchema = zod_1.z.object({
    fullName: zod_1.z.string().min(2).max(255).optional(),
    phone: zod_1.z.string().max(30).optional(),
    dob: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    docType: zod_1.z.enum(['DNI', 'RUC', 'CE', 'PASAPORTE']).optional(),
    docNumber: zod_1.z.string().max(20).optional(),
    addressLine1: zod_1.z.string().max(255).optional(),
    district: zod_1.z.string().max(100).optional(),
    province: zod_1.z.string().max(100).optional(),
    addressLabel: zod_1.z.string().max(50).optional(),
});
//# sourceMappingURL=auth.dto.js.map