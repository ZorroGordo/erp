import { z } from 'zod';

// ─── Register ──────────────────────────────────────────────────────────────
export const RegisterSchema = z.object({
  email:    z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  fullName: z.string().min(2).max(255),
  phone:    z.string().optional(),
  docType:  z.enum(['DNI', 'RUC', 'CE', 'PASAPORTE']).optional(),
  docNumber:z.string().optional(),
  type:            z.enum(['B2C', 'B2B']).default('B2C'),
  cfTurnstileToken: z.string().optional(),
});
export type RegisterDto = z.infer<typeof RegisterSchema>;

// ─── Login ─────────────────────────────────────────────────────────────────
export const LoginSchema = z.object({
  email:    z.string().email(),
  password:        z.string().min(1),
  cfTurnstileToken: z.string().optional(),
});
export type LoginDto = z.infer<typeof LoginSchema>;

// ─── Refresh ───────────────────────────────────────────────────────────────
export const RefreshSchema = z.object({
  refreshToken: z.string().min(1),
});
export type RefreshDto = z.infer<typeof RefreshSchema>;

// ─── Guest ─────────────────────────────────────────────────────────────────
export const GuestSchema = z.object({
  email:    z.string().email().optional(),
  fullName: z.string().optional(),
});
export type GuestDto = z.infer<typeof GuestSchema>;

// ─── Verify email ──────────────────────────────────────────────────────────
export const VerifyEmailSchema = z.object({ token: z.string().min(1) });
export type VerifyEmailDto = z.infer<typeof VerifyEmailSchema>;

// ─── Password reset ────────────────────────────────────────────────────────
export const ForgotPasswordSchema = z.object({ email: z.string().email() });
export type ForgotPasswordDto = z.infer<typeof ForgotPasswordSchema>;

export const ResetPasswordSchema = z.object({
  token:    z.string().min(1),
  password: z.string().min(8),
});
export type ResetPasswordDto = z.infer<typeof ResetPasswordSchema>;

// ─── Update profile ────────────────────────────────────────────────────────
export const UpdateProfileSchema = z.object({
  fullName:  z.string().min(2).max(255).optional(),
  phone:     z.string().max(30).optional(),
  dob:       z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  docType:   z.enum(['DNI', 'RUC', 'CE', 'PASAPORTE']).optional(),
  docNumber: z.string().max(20).optional(),
  // Address fields (stored as default address)
  addressLine1: z.string().max(255).optional(),
  district:     z.string().max(100).optional(),
  province:     z.string().max(100).optional(),
  addressLabel: z.string().max(50).optional(),
});
export type UpdateProfileDto = z.infer<typeof UpdateProfileSchema>;

// ─── Response types ────────────────────────────────────────────────────────
export interface AuthTokensDto {
  accessToken:  string;
  refreshToken: string;
  expiresIn:    number;  // seconds
}

export interface GuestSessionDto {
  sessionToken: string;
  expiresAt:    string;
}
