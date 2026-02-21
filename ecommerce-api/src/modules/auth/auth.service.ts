import {
  Injectable, ConflictException, UnauthorizedException,
  NotFoundException, BadRequestException, Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { PrismaService } from '../../database/prisma.service';
import type { Env } from '../../config/configuration'
import type {
  RegisterDto, LoginDto, RefreshDto, GuestDto,
  ForgotPasswordDto, ResetPasswordDto,
  AuthTokensDto, GuestSessionDto,
} from './auth.dto';
import type { JwtPayload } from './jwt.strategy';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma:     PrismaService,
    private readonly jwtService: JwtService,
    private readonly config:     ConfigService<Env>,
  ) {}

  // ─── Register ─────────────────────────────────────────────────────────────

  async register(dto: RegisterDto): Promise<AuthTokensDto> {
    await this.verifyTurnstile(dto.cfTurnstileToken);
    const exists = await this.prisma.webUser.findUnique({ where: { email: dto.email } });
    if (exists) throw new ConflictException('Este email ya está registrado');

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const user = await this.prisma.webUser.create({
      data: {
        email:        dto.email,
        passwordHash,
        fullName:     dto.fullName,
        phone:        dto.phone,
        docType:      dto.docType as any,
        docNumber:    dto.docNumber,
        type:         dto.type as any,
      },
    });

    // Queue email verification (fire-and-forget — errors logged only)
    this.queueEmailVerification(user.id, user.email).catch(
      (err) => this.logger.error('Failed to queue email verification', err),
    );

    return this.issueTokenPair(user.id, user.email, user.type as 'B2C' | 'B2B');
  }

  // ─── Login ────────────────────────────────────────────────────────────────

  async login(dto: LoginDto): Promise<AuthTokensDto> {
    await this.verifyTurnstile(dto.cfTurnstileToken);
    const user = await this.prisma.webUser.findUnique({
      where: { email: dto.email },
      select: { id: true, email: true, passwordHash: true, type: true, isActive: true },
    });

    if (!user || !user.isActive) throw new UnauthorizedException('Credenciales inválidas');
    if (!user.passwordHash)       throw new UnauthorizedException('Usa el enlace de inicio de sesión');

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Credenciales inválidas');

    await this.prisma.webUser.update({
      where: { id: user.id },
      data:  { lastLoginAt: new Date() },
    });

    return this.issueTokenPair(user.id, user.email, user.type as 'B2C' | 'B2B');
  }

  // ─── Refresh token rotation ───────────────────────────────────────────────

  async refresh(dto: RefreshDto): Promise<AuthTokensDto> {
    // 1. Verify JWT signature + expiry
    let payload: JwtPayload;
    try {
      const pubKeyB64 = this.config.getOrThrow('JWT_PUBLIC_KEY');
      const publicKey = pubKeyB64.trim().startsWith('-----') ? pubKeyB64.trim() : Buffer.from(pubKeyB64, 'base64').toString('utf-8');
      payload = this.jwtService.verify<JwtPayload>(dto.refreshToken, {
        publicKey,
        algorithms: ['RS256'],
      });
    } catch {
      throw new UnauthorizedException('Token de refresco inválido');
    }

    // 2. Find token record by hash
    const tokenHash = await this.hashToken(dto.refreshToken);
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
    });

    if (!stored) throw new UnauthorizedException('Token de refresco inválido');

    // 3. Family-based reuse detection: if already revoked → revoke entire family
    if (stored.isRevoked) {
      await this.prisma.refreshToken.updateMany({
        where:  { family: stored.family },
        data:   { isRevoked: true },
      });
      throw new UnauthorizedException('Token de refresco reutilizado — sesión revocada');
    }

    // 4. Revoke the used token
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data:  { isRevoked: true },
    });

    // 5. Issue new pair (same family)
    const user = await this.prisma.webUser.findUniqueOrThrow({ where: { id: stored.userId } });
    return this.issueTokenPair(user.id, user.email, user.type as 'B2C' | 'B2B', stored.family);
  }

  // ─── Guest session ────────────────────────────────────────────────────────

  async createGuestSession(dto: GuestDto): Promise<GuestSessionDto> {
    const sessionToken = crypto.randomBytes(32).toString('hex');
    const expiresAt    = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

    await this.prisma.guestSession.create({
      data: {
        sessionToken,
        email:    dto.email,
        fullName: dto.fullName,
        expiresAt,
      },
    });

    return { sessionToken, expiresAt: expiresAt.toISOString() };
  }

  async validateGuestSession(token: string) {
    const session = await this.prisma.guestSession.findUnique({
      where: { sessionToken: token },
    });
    if (!session || session.expiresAt < new Date()) {
      throw new UnauthorizedException('Sesión de invitado expirada');
    }
    return session;
  }

  // ─── Email verification ───────────────────────────────────────────────────

  async verifyEmail(token: string): Promise<{ message: string }> {
    const record = await this.prisma.emailVerification.findUnique({ where: { token } });
    if (!record || record.expiresAt < new Date()) {
      throw new BadRequestException('Enlace de verificación inválido o expirado');
    }
    if (record.usedAt) {
      return { message: 'Email ya verificado' };
    }

    await this.prisma.$transaction([
      this.prisma.emailVerification.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
      this.prisma.webUser.update({ where: { id: record.userId }, data: { isEmailVerified: true } }),
    ]);

    return { message: 'Email verificado exitosamente' };
  }

  // ─── Forgot / Reset password ──────────────────────────────────────────────

  async forgotPassword(dto: ForgotPasswordDto): Promise<{ message: string }> {
    const user = await this.prisma.webUser.findUnique({ where: { email: dto.email } });
    // Always return 200 to avoid email enumeration
    if (!user) return { message: 'Si el email existe, recibirás un enlace' };

    const token     = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1h

    await this.prisma.passwordReset.create({
      data: { userId: user.id, token, expiresAt },
    });

    // TODO: queue email with reset link via NotificationsService
    this.logger.log(`Password reset token for ${dto.email}: ${token}`);

    return { message: 'Si el email existe, recibirás un enlace' };
  }

  async resetPassword(dto: ResetPasswordDto): Promise<{ message: string }> {
    const record = await this.prisma.passwordReset.findUnique({ where: { token: dto.token } });
    if (!record || record.expiresAt < new Date()) {
      throw new BadRequestException('Enlace de recuperación inválido o expirado');
    }
    if (record.usedAt) {
      throw new BadRequestException('Este enlace ya fue utilizado');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);
    await this.prisma.$transaction([
      this.prisma.passwordReset.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
      this.prisma.webUser.update({ where: { id: record.userId }, data: { passwordHash } }),
      // Revoke all refresh tokens for this user
      this.prisma.refreshToken.updateMany({ where: { userId: record.userId }, data: { isRevoked: true } }),
    ]);

    return { message: 'Contraseña actualizada exitosamente' };
  }

  // ─── Full profile (for frontend) ──────────────────────────────────────────

  async getFullProfile(userId: string) {
    const user = await this.prisma.webUser.findUnique({
      where:   { id: userId },
      include: { addresses: { where: { isDefault: true }, take: 1 } },
    });
    if (!user) throw new NotFoundException('User not found');

    const addr = user.addresses[0];
    return {
      id:          user.id,
      name:        user.fullName  ?? '',
      email:       user.email,
      phone:       user.phone     ?? '',
      type:        user.type.toLowerCase() as 'b2c' | 'b2b',
      dob:         user.dob ? user.dob.toISOString().slice(0, 10) : undefined,
      ruc:         user.docType === 'RUC' ? user.docNumber : undefined,
      razonSocial: user.type === 'B2B'   ? user.fullName  : undefined,
      address: addr ? {
        street:    addr.addressLine1,
        district:  addr.district,
        city:      addr.province ?? 'Lima',
        reference: addr.addressLine2 ?? undefined,
      } : undefined,
    };
  }

  async updateProfile(userId: string, dto: import('./auth.dto').UpdateProfileDto) {
    const updateData: Record<string, unknown> = {};
    if (dto.fullName !== undefined)  updateData.fullName  = dto.fullName;
    if (dto.phone    !== undefined)  updateData.phone     = dto.phone;
    if (dto.dob      !== undefined)  updateData.dob       = new Date(dto.dob);
    if (dto.docType  !== undefined)  updateData.docType   = dto.docType;
    if (dto.docNumber !== undefined) updateData.docNumber = dto.docNumber;

    await this.prisma.webUser.update({ where: { id: userId }, data: updateData as any });

    // Update or create default address
    if (dto.addressLine1 || dto.district) {
      const existing = await this.prisma.webUserAddress.findFirst({
        where: { userId, isDefault: true },
      });
      const addrData = {
        userId,
        label:        dto.addressLabel ?? 'Casa',
        addressLine1: dto.addressLine1 ?? '',
        district:     dto.district     ?? '',
        province:     dto.province,
        isDefault:    true,
      };
      if (existing) {
        await this.prisma.webUserAddress.update({ where: { id: existing.id }, data: addrData });
      } else {
        await this.prisma.webUserAddress.create({ data: addrData });
      }
    }

    return this.getFullProfile(userId);
  }

  // ─── Logout ───────────────────────────────────────────────────────────────

  async logout(refreshToken: string): Promise<void> {
    const tokenHash = await this.hashToken(refreshToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash },
      data:  { isRevoked: true },
    });
  }

  // ─── Private helpers ──────────────────────────────────────────────────────


  // Turnstile verification (skipped if TURNSTILE_SECRET_KEY not set)
  private async verifyTurnstile(token?: string): Promise<void> {
    const secret = process.env.TURNSTILE_SECRET_KEY;
    if (!secret || !token) return;
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret, response: token }),
    });
    const data: any = await res.json();
    if (!data.success) {
      throw Object.assign(new Error("Verificacion de seguridad fallida."), { statusCode: 400, code: "TURNSTILE_FAILED" });
    }
  }

  private async issueTokenPair(
    userId: string,
    email: string,
    type: 'B2C' | 'B2B',
    family = uuidv4(),
  ): Promise<AuthTokensDto> {
    const privKeyB64 = this.config.getOrThrow('JWT_PRIVATE_KEY');
    const privateKey = privKeyB64.trim().startsWith('-----') ? privKeyB64.trim() : Buffer.from(privKeyB64, 'base64').toString('utf-8');

    const accessExpiresIn  = this.config.get('JWT_ACCESS_EXPIRES')  ?? '15m';
    const refreshExpiresIn = this.config.get('JWT_REFRESH_EXPIRES') ?? '7d';

    const payload: Omit<JwtPayload, 'iat' | 'exp'> = { sub: userId, email, type };

    const accessToken = this.jwtService.sign(payload, {
      privateKey,
      algorithm: 'RS256',
      expiresIn: accessExpiresIn,
    });

    const refreshToken = this.jwtService.sign(payload, {
      privateKey,
      algorithm: 'RS256',
      expiresIn: refreshExpiresIn,
    });

    // Persist hashed refresh token
    const tokenHash  = await this.hashToken(refreshToken);
    const expiresAt  = new Date(Date.now() + this.parseDuration(refreshExpiresIn));
    await this.prisma.refreshToken.create({
      data: { userId, tokenHash, family, expiresAt },
    });

    return { accessToken, refreshToken, expiresIn: this.parseDuration(accessExpiresIn) / 1000 };
  }

  private async hashToken(token: string): Promise<string> {
    // Use SHA-256 (not bcrypt) so we can look it up by hash
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  private parseDuration(duration: string): number {
    const units: Record<string, number> = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
    const match = duration.match(/^(\d+)([smhd])$/);
    if (!match) throw new Error(`Invalid duration: ${duration}`);
    return parseInt(match[1]) * units[match[2]];
  }

  private async queueEmailVerification(userId: string, email: string): Promise<void> {
    const token     = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await this.prisma.emailVerification.create({ data: { userId, token, expiresAt } });
    // TODO: integrate with NotificationsService (BullMQ) in Milestone 9
    this.logger.log(`[DEV] Email verification token for ${email}: ${token}`);
  }
}
