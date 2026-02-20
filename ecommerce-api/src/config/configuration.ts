import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV:              z.enum(['development', 'production', 'test']).default('development'),
  PORT:                  z.coerce.number().default(4000),
  DATABASE_URL:          z.string(),
  REDIS_URL:             z.string().default('redis://localhost:6379'),
  JWT_PRIVATE_KEY:       z.string(),
  JWT_PUBLIC_KEY:        z.string(),
  JWT_ACCESS_EXPIRES:    z.string().default('15m'),
  JWT_REFRESH_EXPIRES:   z.string().default('7d'),
  ERP_API_URL:           z.string().default('http://localhost:3000'),
  ERP_API_KEY:           z.string(),
  CULQI_PUBLIC_KEY:      z.string(),
  CULQI_SECRET_KEY:      z.string(),
  CULQI_WEBHOOK_SECRET:  z.string(),
  AWS_REGION:            z.string().default('us-east-1'),
  AWS_ACCESS_KEY_ID:     z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  S3_BUCKET:             z.string().default('victorsdou-invoices'),
  SES_FROM_EMAIL:        z.string().email(),
  INTERNAL_API_KEY:      z.string(),
});

export type Env = z.infer<typeof envSchema>;

export const configuration = (): Env => {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    throw new Error(`❌ Invalid environment variables:\n${result.error.message}`);
  }
  return result.data;
};
