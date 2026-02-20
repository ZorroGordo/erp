import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../lib/prisma';

// ── Audit Context (attached to request) ──────────────────────────────────────

declare module 'fastify' {
  interface FastifyRequest {
    auditCtx: {
      module: string;
      recordId: string;
      action: string;
      beforeState?: unknown;
    } | null;
  }
}

export const auditPlugin = fp(async (app: FastifyInstance) => {
  app.decorateRequest('auditCtx', null);

  // On response — write audit log if context was set
  app.addHook('onSend', async (req: FastifyRequest, reply: FastifyReply, payload) => {
    if (!req.auditCtx || !req.actor) return payload;

    const { module, recordId, action, beforeState } = req.auditCtx;
    const statusCode = reply.statusCode;

    // Only audit mutating methods on success
    if (!['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method)) return payload;
    if (statusCode >= 400) return payload;

    let afterState: unknown = undefined;
    try {
      afterState = typeof payload === 'string' ? JSON.parse(payload) : payload;
    } catch { /* non-JSON response */ }

    // Write async — do not block response
    setImmediate(async () => {
      try {
        await prisma.auditLog.create({
          data: {
            userId:      req.actor!.sub,
            action,
            module,
            recordId:    recordId ?? 'unknown',
            beforeState: beforeState ? (beforeState as object) : undefined,
            afterState:  afterState ? (afterState as object) : undefined,
            ipAddress:   req.ip,
            userAgent:   req.headers['user-agent'],
          },
        });
      } catch (err) {
        req.log.error({ err }, '[Audit] Failed to write audit log');
      }
    });

    return payload;
  });
});

// ── Helper for route handlers ─────────────────────────────────────────────────

export function setAuditContext(
  req: FastifyRequest,
  module: string,
  action: string,
  recordId: string,
  beforeState?: unknown,
): void {
  req.auditCtx = { module, action, recordId, beforeState };
}
