import type { FastifyInstance } from 'fastify';
import { loginSchema } from './schema';
import * as AuthService from './service';
import { requireAuth, requireAnyOf } from '../../middleware/auth';
import { prisma } from '../../lib/prisma';
import { sendEmail } from '../../lib/email';
import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify, importPKCS8, importSPKI } from 'jose';
import { config } from '../../config/index';

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
  // ── POST /v1/auth/register (customer B2C self-service) ──────────────────
  app.post('/register', {
    schema: { summary: 'Self-service registration for ecommerce customers', tags: ['Auth'] },
  }, async (req, reply) => {
    const { email, fullName, password, phone } = req.body as {
      email: string; fullName: string; password: string; phone?: string;
    };
    if (!email || !fullName || !password) {
      return reply.code(400).send({ error: 'MISSING_FIELDS', message: 'email, fullName and password are required' });
    }
    const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (existing) {
      return reply.code(409).send({ error: 'EMAIL_TAKEN', message: 'Email already in use' });
    }
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: {
        email:    email.toLowerCase(),
        fullName,
        passwordHash,
        roles:    ['CUSTOMER_B2C'] as never,
        isActive: true,
        // phone is not on the User model — stored on Customer record if needed
      },
      select: USER_SELECT,
    });
    const { user: authUser, tokens, refreshToken } = await AuthService.login({
      email: email.toLowerCase(),
      password,
    });
    reply.setCookie(REFRESH_COOKIE, refreshToken, COOKIE_OPTS);
    return reply.code(201).send({ data: { user: authUser, tokens } });
  });

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

  // ── POST /v1/auth/forgot-password ───────────────────────────────────────
  app.post('/forgot-password', {
    schema: { summary: 'Request a password reset link via email', tags: ['Auth'] },
  }, async (req, reply) => {
    const { email } = req.body as { email?: string };
    if (!email) {
      return reply.code(400).send({ error: 'MISSING_EMAIL' });
    }
    // Always respond 200 to prevent email enumeration
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      select: { id: true, email: true, fullName: true, passwordHash: true, isActive: true },
    });
    if (user && user.isActive) {
      const privateKey = await importPKCS8(
        config.JWT_PRIVATE_KEY.replace(/\\n/g, '\n'), 'RS256'
      );
      // Embed first 12 chars of current passwordHash so token is single-use
      const token = await new SignJWT({
        sub:    user.id,
        type:   'password-reset',
        pwSig:  user.passwordHash.substring(0, 12),
      })
        .setProtectedHeader({ alg: 'RS256' })
        .setIssuedAt()
        .setExpirationTime('1h')
        .sign(privateKey);

      const resetUrl = `https://victorsdou.pe/recuperar?token=${token}`;
      await sendEmail({
        to:      [user.email],
        subject: 'Recupera tu contraseña — Victorsdou',
        html: `
          <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:2rem">
            <p style="font-size:1.1rem;color:#1A1A1A">Hola${user.fullName ? ` ${user.fullName.split(' ')[0]}` : ''},</p>
            <p style="color:#4A4A4A;line-height:1.6">Recibimos una solicitud para restablecer la contraseña de tu cuenta Victorsdou.</p>
            <p style="margin:2rem 0;text-align:center">
              <a href="${resetUrl}" style="display:inline-block;background:#1A1A1A;color:#fff;padding:.875rem 2.5rem;text-decoration:none;font-size:.85rem;letter-spacing:.15em;font-weight:600">RESTABLECER CONTRASEÑA</a>
            </p>
            <p style="color:#7A7A7A;font-size:.875rem;line-height:1.6">El enlace expira en <strong>1 hora</strong>. Si no solicitaste este cambio, puedes ignorar este correo.</p>
            <hr style="border:none;border-top:1px solid #eee;margin:2rem 0">
            <p style="color:#A0A0A0;font-size:.75rem">Victorsdou · Pan de Masa Madre Artesanal · Lima, Perú</p>
          </div>
        `,
      });
    }
    return reply.code(200).send({ data: { message: 'If this email is registered, you will receive a reset link.' } });
  });

  // ── POST /v1/auth/reset-password ─────────────────────────────────────────
  app.post('/reset-password', {
    schema: { summary: 'Reset password using a signed token', tags: ['Auth'] },
  }, async (req, reply) => {
    const { token, password } = req.body as { token?: string; password?: string };
    if (!token || !password) {
      return reply.code(400).send({ error: 'MISSING_FIELDS' });
    }
    if (password.length < 8) {
      return reply.code(400).send({ error: 'PASSWORD_TOO_SHORT', message: 'Password must be at least 8 characters' });
    }
    let payload: any;
    try {
      const publicKey = await importSPKI(
        config.JWT_PUBLIC_KEY.replace(/\\n/g, '\n'), 'RS256'
      );
      const result = await jwtVerify(token, publicKey);
      payload = result.payload;
    } catch {
      return reply.code(400).send({ error: 'INVALID_TOKEN', message: 'Reset link is invalid or has expired' });
    }
    if (payload.type !== 'password-reset' || !payload.sub) {
      return reply.code(400).send({ error: 'INVALID_TOKEN' });
    }
    const user = await prisma.user.findUnique({
      where: { id: payload.sub as string },
      select: { id: true, passwordHash: true, isActive: true },
    });
    if (!user || !user.isActive) {
      return reply.code(400).send({ error: 'INVALID_TOKEN' });
    }
    // Verify the pwSig still matches (token becomes invalid after any password change)
    if (user.passwordHash.substring(0, 12) !== payload.pwSig) {
      return reply.code(400).send({ error: 'TOKEN_ALREADY_USED', message: 'This reset link has already been used' });
    }
    const passwordHash = await bcrypt.hash(password, 12);
    await prisma.user.update({
      where: { id: user.id },
      data:  { passwordHash, refreshTokenHash: null },
    });
    return reply.code(200).send({ data: { message: 'Password updated successfully' } });
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
