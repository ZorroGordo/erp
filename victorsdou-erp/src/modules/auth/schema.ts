import { z } from 'zod';

export const loginSchema = z.object({
  email:    z.string().email(),
  password: z.string().min(8),
  totpCode: z.string().length(6).optional(),
});

export const refreshSchema = z.object({
  // refresh token comes from HTTP-only cookie; no body needed
});

export type LoginInput    = z.infer<typeof loginSchema>;
export type RefreshInput  = z.infer<typeof refreshSchema>;
