import type { FastifyInstance } from 'fastify';
import { loginSchema } from './schema';
import * as AuthService from './service';
import { requireAuth, requireAnyOf } from '../../middleware/auth';
import { prisma } from '../../lib/prisma';
import bcrypt from 'bcryptjs';

const REFRESH_COOKIE = 'vos_refresh';
const COOKIE_OPTS = {
  httpOnly: true,
  secure:   process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  path:     '/v1/auth/refresh',
  maxAge:   7 * 24 * 60 * 60, // 7 days in seconds
};

const USER_SELECT = {
  id: true, email: true, fullName: true, roles: true,
  isActive: true, createdAt: true, lastLoginAt: true,
};

export async function authRoutes(app: FastifyInstance) {
  // ── POST /v1/auth/login ─────────────────────────────────────────────────
  app.post('/login', {
    schema: {
      summary: 'Login with email + password (+ optional MFA TOTP)',
      tags: ['Auth'],
    },
  }, async (req, reply) => {
    const body = loginSchema.parse(req.body);
    const { user, tokens, refreshToken } = await AuthService.login(body);

    reply.setCookie(REFRESH_COOKIE, refreshToken, COOKIE_OPTS);
    return reply.code(200).send({ data: { user, tokens } });
  });

  // ── POST /v1/auth/refresh ───────────────────────────────────────────────
  app.post('/refresh', {
    schema: { summary: 'Refresh access token using HTTP-only cookie', tags: ['Auth'] },
  }, async (req, reply) => {
    const refreshToken = req.cookies[REFRESH_COOKIE];
    if (!refreshToken) {
      return reply.code(401).send({ error: 'NO_REFRESH_TOKEN', message: 'Refresh cookie missing' });
    }

    const tokens = await AuthService.refresh(refreshToken);
    return reply.code(200).send({ data: { tokens } });
  });

  // ── POST /v1/auth/logout ────────────────────────────────────────────────
  app.post('/logout', {
    preHandler: [requireAuth()],
    schema: { summary: 'Revoke session tokens', tags: ['Auth'], security: [{ bearerAuth: [] }] },
  }, async (req, reply) => {
    await AuthService.logout(req.actor!.sub);
    reply.clearCookie(REFRESH_COOKIE, { path: '/v1/auth/refresh' });
    return reply.code(200).send({ data: { message: 'Logged out successfully' } });
  });

  // ── GET /v1/auth/me ─────────────────────────────────────────────────────
  app.get('/me', {
    preHandler: [requireAuth()],
    schema: { summary: 'Get current authenticated user', tags: ['Auth'], security: [{ bearerAuth: [] }] },
  }, async (req, reply) => {
    return reply.code(200).send({ data: { actor: req.actor } });
  });

  // ── GET /v1/auth/users ──────────────────────────────────────────────────
  app.get('/users', { preHandler: [requireAnyOf('SUPER_ADMIN')] }, async (_req, reply) => {
    const users = await prisma.user.findMany({
      select: USER_SELECT,
      orderBy: { fullName: 'asc' },
    });
    return reply.send({ data: users });
  });

  // ── POST /v1/auth/users ─────────────────────────────────────────────────
  app.post('/users', { preHandler: [requireAnyOf('SUPER_ADMIN')] }, async (req, reply) => {
    const body = req.body as {
      email: string;
      fullName: string;
      password: string;
      roles: string[];
    };

    const existing = await prisma.user.findUnique({ where: { email: body.email.toLowerCase() } });
    if (existing) {
      return reply.code(409).send({ error: 'EMAIL_TAKEN', message: 'Email already in use' });
    }

    const passwordHash = await bcrypt.hash(body.password, 12);
    const user = await prisma.user.create({
      data: {
        email:        body.email.toLowerCase(),
        fullName:     body.fullName,
        passwordHash,
        roles:        body.roles as never,
        isActive:     true,
      },
      select: USER_SELECT,
    });
    return reply.code(201).send({ data: user });
  });

  // ── PATCH /v1/auth/users/:id ────────────────────────────────────────────
  app.patch('/users/:id', { preHandler: [requireAnyOf('SUPER_ADMIN')] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as {
      fullName?: string;
      email?: string;
      password?: string;
      roles?: string[];
      isActive?: boolean;
    };

    const data: Record<string, unknown> = {};
    if (body.fullName  !== undefined) data.fullName  = body.fullName;
    if (body.email     !== undefined) data.email     = body.email.toLowerCase();
    if (body.roles     !== undefined) data.roles     = body.roles;
    if (body.isActive  !== undefined) data.isActive  = body.isActive;
    if (body.password) {
      data.passwordHash = await bcrypt.hash(body.password, 12);
      data.refreshTokenHash = null; // force re-login after password change
    }

    const user = await prisma.user.update({
      where: { id },
      data: data as never,
      select: USER_SELECT,
    });
    return reply.send({ data: user });
  });
}
