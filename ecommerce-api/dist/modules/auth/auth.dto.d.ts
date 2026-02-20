import { z } from 'zod';
export declare const RegisterSchema: z.ZodObject<{
    email: z.ZodString;
    password: z.ZodString;
    fullName: z.ZodString;
    phone: z.ZodOptional<z.ZodString>;
    docType: z.ZodOptional<z.ZodEnum<{
        DNI: "DNI";
        RUC: "RUC";
        CE: "CE";
        PASAPORTE: "PASAPORTE";
    }>>;
    docNumber: z.ZodOptional<z.ZodString>;
    type: z.ZodDefault<z.ZodEnum<{
        B2C: "B2C";
        B2B: "B2B";
    }>>;
}, z.core.$strip>;
export type RegisterDto = z.infer<typeof RegisterSchema>;
export declare const LoginSchema: z.ZodObject<{
    email: z.ZodString;
    password: z.ZodString;
}, z.core.$strip>;
export type LoginDto = z.infer<typeof LoginSchema>;
export declare const RefreshSchema: z.ZodObject<{
    refreshToken: z.ZodString;
}, z.core.$strip>;
export type RefreshDto = z.infer<typeof RefreshSchema>;
export declare const GuestSchema: z.ZodObject<{
    email: z.ZodOptional<z.ZodString>;
    fullName: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type GuestDto = z.infer<typeof GuestSchema>;
export declare const VerifyEmailSchema: z.ZodObject<{
    token: z.ZodString;
}, z.core.$strip>;
export type VerifyEmailDto = z.infer<typeof VerifyEmailSchema>;
export declare const ForgotPasswordSchema: z.ZodObject<{
    email: z.ZodString;
}, z.core.$strip>;
export type ForgotPasswordDto = z.infer<typeof ForgotPasswordSchema>;
export declare const ResetPasswordSchema: z.ZodObject<{
    token: z.ZodString;
    password: z.ZodString;
}, z.core.$strip>;
export type ResetPasswordDto = z.infer<typeof ResetPasswordSchema>;
export declare const UpdateProfileSchema: z.ZodObject<{
    fullName: z.ZodOptional<z.ZodString>;
    phone: z.ZodOptional<z.ZodString>;
    dob: z.ZodOptional<z.ZodString>;
    docType: z.ZodOptional<z.ZodEnum<{
        DNI: "DNI";
        RUC: "RUC";
        CE: "CE";
        PASAPORTE: "PASAPORTE";
    }>>;
    docNumber: z.ZodOptional<z.ZodString>;
    addressLine1: z.ZodOptional<z.ZodString>;
    district: z.ZodOptional<z.ZodString>;
    province: z.ZodOptional<z.ZodString>;
    addressLabel: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type UpdateProfileDto = z.infer<typeof UpdateProfileSchema>;
export interface AuthTokensDto {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
}
export interface GuestSessionDto {
    sessionToken: string;
    expiresAt: string;
}
