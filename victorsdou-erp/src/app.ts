import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { config } from './config';
import { redis } from './lib/redis';

// Middleware
import { authPlugin } from './middleware/auth';
import { auditPlugin } from './middleware/audit';

// Modules
import { authRoutes }       from './modules/auth/routes';
import { inventoryRoutes }  from './modules/inventory/routes';
import { productionRoutes } from './modules/production/routes';
import { procurementRoutes }from './modules/procurement/routes';
import { catalogRoutes }    from './modules/catalog/routes';
import { customersRoutes }  from './modules/customers/routes';
import { salesRoutes }      from './modules/sales/routes';
import { invoicingRoutes }  from './modules/invoicing/routes';
import { accountingRoutes } from './modules/accounting/routes';
import { deliveryRoutes }   from './modules/delivery/routes';
import { payrollRoutes }    from './modules/payroll/routes';
import { aiRoutes }         from './modules/ai/routes';
import { comprobantesRoutes }          from './modules/comprobantes/routes';
import { lookupRoutes }                from './modules/lookup/routes';
import { notificationsWebhookRoutes }  from './modules/notifications/routes';

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: config.NODE_ENV === 'test' ? 'silent' : 'info',
      transport:
        config.NODE_ENV === 'development'
          ? { target: 'pino-pretty', options: { colorize: true } }
          : undefined,
    },
    trustProxy: true,
    requestIdLogLabel: 'requestId',
    genReqId: (req) =>
      (req.headers['x-request-id'] as string) ?? crypto.randomUUID(),
  });

  // ── Security Headers ─────────────────────────────────────────────────────
  await app.register(helmet, {
    contentSecurityPolicy: config.NODE_ENV === 'production',
  });

  // ── CORS ─────────────────────────────────────────────────────────────────
  await app.register(cors, {
    origin: config.CORS_ALLOWED_ORIGINS.split(',').map((o) => o.trim()),
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  });

  // ── Cookie Parser ────────────────────────────────────────────────────────
  await app.register(cookie, {
    secret: config.JWT_PRIVATE_KEY,
  });

  // ── Multipart (for email ingest webhook) ─────────────────────────────────
  await app.register(multipart, {
    limits: { fileSize: 20 * 1024 * 1024, files: 10 },
  });

  // ── Rate Limiting ────────────────────────────────────────────────────────
  await app.register(rateLimit, {
    redis,
    max: 1000,
    timeWindow: '1 minute',
    keyGenerator: (req) =>
      req.headers['x-user-id'] as string ?? req.ip,
  });

  // ── Swagger / OpenAPI ─────────────────────────────────────────────────────
  if (config.NODE_ENV !== 'production') {
    await app.register(swagger, {
      openapi: {
        info: {
          title: 'VictorOS ERP API',
          description: 'Victorsdou Bakery — Complete ERP REST API',
          version: '1.0.0',
        },
        servers: [{ url: `http://localhost:${config.PORT}` }],
        components: {
          securitySchemes: {
            bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
          },
        },
        security: [{ bearerAuth: [] }],
      },
    });
    await app.register(swaggerUi, {
      routePrefix: '/docs',
      uiConfig: { docExpansion: 'list' },
    });
  }

  // ── Auth Plugin (JWT verification, user injection) ──────────────────────
  await app.register(authPlugin);

  // ── Audit Log Plugin ─────────────────────────────────────────────────────
  await app.register(auditPlugin);

  // ── Health Check ─────────────────────────────────────────────────────────
  app.get('/health', { logLevel: 'silent' }, async (_req, reply) => {
    return reply.send({
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version,
    });
  });

  // ── Internal API Routes ──────────────────────────────────────────────────
  await app.register(async (api) => {
    await api.register(authRoutes,        { prefix: '/auth' });
    await api.register(inventoryRoutes,   { prefix: '/inventory' });
    await api.register(productionRoutes,  { prefix: '/production' });
    await api.register(procurementRoutes, { prefix: '/procurement' });
    await api.register(catalogRoutes,     { prefix: '/products' });
    await api.register(customersRoutes,   { prefix: '/customers' });
    await api.register(salesRoutes,       { prefix: '/sales-orders' });
    await api.register(invoicingRoutes,   { prefix: '/invoices' });
    await api.register(accountingRoutes,  { prefix: '/accounting' });
    await api.register(deliveryRoutes,    { prefix: '/delivery' });
    await api.register(payrollRoutes,     { prefix: '/payroll' });
    await api.register(aiRoutes,          { prefix: '/ai' });
    await api.register(comprobantesRoutes, { prefix: '/comprobantes' });
    await api.register(lookupRoutes,       { prefix: '/lookup' });
  }, { prefix: '/v1' });

  // ── Public API Routes ─────────────────────────────────────────────────────
  await app.register(async (pub) => {
    pub.get('/catalog', async (_req, reply) => {
      // TODO: serve cached public catalog
      return reply.send({ products: [] });
    });
    pub.get('/catalog/:sku', async (req, reply) => {
      const { sku } = req.params as { sku: string };
      return reply.send({ sku, available: true });
    });
  }, { prefix: '/public/v1' });

  // ── Webhook Routes ────────────────────────────────────────────────────────
  await app.register(async (wh) => {
    wh.post('/nubefact', async (_req, reply) => {
      // Handled in invoicing module separately
      return reply.send({ received: true });
    });
    wh.post('/payment-gateway', async (_req, reply) => {
      return reply.send({ received: true });
    });
    await wh.register(notificationsWebhookRoutes);
  }, { prefix: '/webhooks' });

  // ── 404 Handler ───────────────────────────────────────────────────────────
  app.setNotFoundHandler((_req, reply) => {
    reply.status(404).send({ error: 'NOT_FOUND', message: 'Route not found' });
  });

  // ── Error Handler ─────────────────────────────────────────────────────────
  app.setErrorHandler((error, _req, reply) => {
    app.log.error({ err: error }, 'Unhandled error');
    const statusCode = error.statusCode ?? 500;
    reply.status(statusCode).send({
      error: error.code ?? 'INTERNAL_ERROR',
      message:
        config.NODE_ENV === 'production' && statusCode === 500
          ? 'Internal server error'
          : error.message,
    });
  });

  return app;
}
