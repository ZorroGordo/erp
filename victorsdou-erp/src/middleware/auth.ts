import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { importSPKI, jwtVerify } from 'jose';
import { config } from '../config';
import type { UserRole } from '@prisma/client';

export interface JwtPayload {
  sub: string;         // user ID or customer ID
  email?: string;
  roles: UserRole[];
  customerId?: string; // set for CUSTOMER_B2C / CUSTOMER_B2B tokens
  type: 'user' | 'customer';
  iat: number;
  exp: number;
}

declare module 'fastify' {
  interface FastifyRequest {
    actor: JwtPayload | null;
  }
}

export const authPlugin = fp(async (app: FastifyInstance) => {
  // Preload public key once
  const publicKey = await importSPKI(
    config.JWT_PUBLIC_KEY.replace(/\\n/g, '\n'),
    'RS256',
  );

  // Decorate request with actor (null if unauthenticated)
  app.decorateRequest('actor', null);

  // Add preHandler that runs on every request BEFORE route handlers
  app.addHook('preHandler', async (req: FastifyRequest) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) return;

    const token = authHeader.slice(7);
    try {
      const { payload } = await jwtVerify(token, publicKey, {
        algorithms: ['RS256'],
      });
      req.actor = payload as unknown as JwtPayload;
    } catch (err) {
      // Invalid or expired token — actor stays null
      // Routes that require auth will reject via requireAuth() below
      req.log.debug({ err }, 'JWT verification failed');
    }
  });
});

// ── Guard Helpers ─────────────────────────────────────────────────────────────
// Used directly in route preHandler arrays

/** Require any valid authenticated actor */
export function requireAuth() {
  return async (req: FastifyRequest) => {
    if (!req.actor) {
      throw Object.assign(new Error('Authentication required'), {
        statusCode: 401,
        code: 'UNAUTHENTICATED',
      });
    }
  };
}

/** Require one or more specific roles (OR logic) */
export function requireRole(...roles: UserRole[]) {
  return async (req: FastifyRequest) => {
    await requireAuth()(req);
    const actorRoles = req.actor!.roles;
    const hasRole = roles.some((r) => actorRoles.includes(r));
    if (!hasRole) {
      throw Object.assign(
        new Error(`Requires one of: ${roles.join(', ')}`),
        { statusCode: 403, code: 'FORBIDDEN' },
      );
    }
  };
}

/** Shorthand: require that the actor is a SUPER_ADMIN or any of the listed roles */
export function requireAnyOf(...roles: UserRole[]) {
  return requireRole('SUPER_ADMIN', ...roles);
}
