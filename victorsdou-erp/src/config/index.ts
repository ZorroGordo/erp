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
  JWT_ACCESS_EXPIRES_IN: z.string().default('1h'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('180d'),
  MONITORING_TOKEN: z.string().optional(),  // bearer token for the weekly error-digest automation

  // CORS
  CORS_ALLOWED_ORIGINS: z.string().default('http://localhost:5173'),

  // Electronic invoicing provider
  INVOICE_PROVIDER: z.literal('factpro').default('factpro'),

  // Factpro (preferred — free tier)
  FACTPRO_API_TOKEN: z.string().optional(),
  FACTPRO_BASE_URL: z.string().default('https://dev.factpro.la/api/v2'),   // dev = SUNAT beta; prod = https://api.factpro.la/api/v2
  FACTPRO_SERIE_FACTURA: z.string().default('F001'),
  FACTPRO_SERIE_BOLETA:  z.string().default('B001'),


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

  // ── LLM used to read supplier quotes ──────────────────────────────────────
  // Layouts vary too much for regex, so one model call turns the quote's text
  // into line items. Provider-agnostic on purpose: nearly every vendor (OpenAI,
  // Groq, DeepSeek, Mistral, Together, OpenRouter) and every self-hosted runner
  // (Ollama, vLLM, llama.cpp) speaks the OpenAI /chat/completions shape, so one
  // driver plus a base URL covers all of them.
  //
  //   LLM_PROVIDER=openai  LLM_BASE_URL=https://api.openai.com/v1
  //                        LLM_API_KEY=...  LLM_MODEL=gpt-4o-mini
  //   LLM_PROVIDER=openai  LLM_BASE_URL=https://api.groq.com/openai/v1  …
  //   LLM_PROVIDER=openai  LLM_BASE_URL=http://localhost:11434/v1  (Ollama, no key)
  //   LLM_PROVIDER=anthropic  ANTHROPIC_API_KEY=…  ANTHROPIC_MODEL=…
  //   LLM_PROVIDER=off     → quotes still register; lines are filled by hand
  //
  // Left unset, it picks openai when LLM_API_KEY/LLM_BASE_URL are present,
  // anthropic when ANTHROPIC_API_KEY is, and otherwise stays off.
  LLM_PROVIDER: z.enum(['anthropic', 'openai', 'off']).optional(),
  LLM_BASE_URL: z.string().optional(),
  LLM_API_KEY: z.string().optional(),
  LLM_MODEL: z.string().optional(),
  /// Hard ceiling per extraction call, so a pathological 80-page PDF can't run
  /// up a bill on any provider.
  LLM_MAX_INPUT_CHARS: z.coerce.number().default(60_000),

  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default('claude-sonnet-4-5'),

  // Cotizaciones por correo
  /// Mailboxes whose inbound mail is treated as a supplier quote, comma-separated.
  /// Both spellings are accepted by default so the flow works whether the SES
  /// receipt rule covers the erp.victorsdou.pe subdomain (no DNS change) or the
  /// main victorsdou.com domain (MX change). Mail to any other address is still
  /// registered as a comprobante, exactly as before.
  QUOTES_INBOX: z.string().default('compras@erp.victorsdou.pe,compras@victorsdou.com,cotizaciones@erp.victorsdou.pe'),
  /// Mailboxes reserved for comprobantes. Mail addressed here is ALWAYS filed as
  /// a comprobante and is never reclassified by the subject heuristic below, so
  /// the inbox Wilfredo already uses keeps its exact current behaviour.
  DOCS_INBOX: z.string().default('docs@erp.victorsdou.pe'),
  /// For any other address, also treat mail as a quote when the subject or an
  /// attachment name says so. Catches quotes sent to whatever address a supplier
  /// happens to have on file. Set empty to disable the heuristic entirely.
  QUOTES_SUBJECT_KEYWORDS: z.string().default('cotizacion,cotización,cotizacón,proforma,quotation,quote,presupuesto'),
  /// Who gets the approval link. Comma-separated. Falls back to OPS_ALERT_EMAIL.
  PURCHASE_APPROVER_EMAILS: z.string().optional(),
  /// Public base URL of the API, used to build the approval link in the email.
  /// Default is the Railway service the frontend already proxies to — note the
  /// Vercel rewrite only forwards /api/v1/*, so the link has to point straight
  /// at the backend rather than at the app domain.
  PUBLIC_API_URL: z.string().default('https://erp-production-10eb.up.railway.app'),
  /// How long an approval link stays valid.
  QUOTE_APPROVAL_TTL_DAYS: z.coerce.number().default(14),

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
