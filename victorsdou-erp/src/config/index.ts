import { z } from 'zod';

const envSchema = z.object({
  // Server
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  HOST: z.string().default('0.0.0.0'),

  // Database
  DATABASE_URL: z.string().url(),

  // Redis
  REDIS_URL: z.string().default('redis://localhost:6379'),

  // JWT — RS256 keys stored in PEM format
  JWT_PRIVATE_KEY: z.string(),      // RSA private key PEM
  JWT_PUBLIC_KEY: z.string(),       // RSA public key PEM
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),

  // CORS
  CORS_ALLOWED_ORIGINS: z.string().default('http://localhost:5173'),

  // Electronic invoicing provider — 'factpro' | 'nubefact'
  INVOICE_PROVIDER: z.enum(['factpro', 'nubefact']).default('factpro'),

  // Factpro (preferred — free tier)
  FACTPRO_API_TOKEN: z.string().optional(),
  FACTPRO_BASE_URL: z.string().default('https://dev.factpro.la/api/v2'),   // dev = SUNAT beta; prod = https://api.factpro.la/api/v2
  FACTPRO_SERIE_FACTURA: z.string().default('F001'),
  FACTPRO_SERIE_BOLETA:  z.string().default('B001'),

  // Nubefact (legacy — kept as fallback)
  NUBEFACT_BASE_URL: z.string().default('https://demo.nubefact.com'),
  NUBEFACT_API_TOKEN: z.string().optional(),
  NUBEFACT_RUC: z.string().optional(),
  NUBEFACT_SERIE_FACTURA: z.string().default('F001'),
  NUBEFACT_SERIE_BOLETA: z.string().default('B001'),

  // AWS / S3
  AWS_REGION: z.string().default('sa-east-1'),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  S3_BUCKET: z.string().default('victorsdou-docs'),
  S3_BASE_URL: z.string().optional(),

  // Email (Amazon SES)
  SES_FROM_EMAIL: z.string().email().default('noreply@victorsdou.pe'),
  SES_INBOUND_BUCKET: z.string().default('victorsdou-docs'),

  // Ops alerts (email + SMS)
  OPS_ALERT_EMAIL: z.string().email().optional(),
  OPS_ALERT_PHONE: z.string().optional(),   // E.164 format, e.g. +51999999999

  // WhatsApp
  WHATSAPP_API_URL: z.string().default('https://graph.facebook.com/v18.0'),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  WHATSAPP_ACCESS_TOKEN: z.string().optional(),

  // Company info
  COMPANY_RUC: z.string(),
  COMPANY_NAME: z.string().default('Victorsdou S.A.C.'),
  COMPANY_ADDRESS: z.string().optional(),

  // AI Service
  AI_SERVICE_URL: z.string().default('http://localhost:8001'),
  AI_SERVICE_API_KEY: z.string().optional(),

  // Peru lookup APIs (apis.net.pe — free tier, register at https://apis.net.pe)
  APIS_NET_PE_TOKEN: z.string().optional(),

});

function loadConfig() {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const missing = result.error.issues
      .map((i) => `  ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`❌ Invalid environment variables:\n${missing}`);
  }
  return result.data;
}

export const config = loadConfig();
export type Config = typeof config;
