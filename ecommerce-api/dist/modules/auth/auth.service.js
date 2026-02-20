"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var AuthService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
const common_1 = require("@nestjs/common");
const jwt_1 = require("@nestjs/jwt");
const config_1 = require("@nestjs/config");
const bcrypt = __importStar(require("bcrypt"));
const crypto = __importStar(require("crypto"));
const uuid_1 = require("uuid");
const prisma_service_1 = require("../../database/prisma.service");
let AuthService = AuthService_1 = class AuthService {
    prisma;
    jwtService;
    config;
    logger = new common_1.Logger(AuthService_1.name);
    constructor(prisma, jwtService, config) {
        this.prisma = prisma;
        this.jwtService = jwtService;
        this.config = config;
    }
    async register(dto) {
        const exists = await this.prisma.webUser.findUnique({ where: { email: dto.email } });
        if (exists)
            throw new common_1.ConflictException('Este email ya está registrado');
        const passwordHash = await bcrypt.hash(dto.password, 12);
        const user = await this.prisma.webUser.create({
            data: {
                email: dto.email,
                passwordHash,
                fullName: dto.fullName,
                phone: dto.phone,
                docType: dto.docType,
                docNumber: dto.docNumber,
                type: dto.type,
            },
        });
        this.queueEmailVerification(user.id, user.email).catch((err) => this.logger.error('Failed to queue email verification', err));
        return this.issueTokenPair(user.id, user.email, user.type);
    }
    async login(dto) {
        const user = await this.prisma.webUser.findUnique({
            where: { email: dto.email },
            select: { id: true, email: true, passwordHash: true, type: true, isActive: true },
        });
        if (!user || !user.isActive)
            throw new common_1.UnauthorizedException('Credenciales inválidas');
        if (!user.passwordHash)
            throw new common_1.UnauthorizedException('Usa el enlace de inicio de sesión');
        const valid = await bcrypt.compare(dto.password, user.passwordHash);
        if (!valid)
            throw new common_1.UnauthorizedException('Credenciales inválidas');
        await this.prisma.webUser.update({
            where: { id: user.id },
            data: { lastLoginAt: new Date() },
        });
        return this.issueTokenPair(user.id, user.email, user.type);
    }
    async refresh(dto) {
        let payload;
        try {
            const pubKeyB64 = this.config.getOrThrow('JWT_PUBLIC_KEY');
            const publicKey = Buffer.from(pubKeyB64, 'base64').toString('utf-8');
            payload = this.jwtService.verify(dto.refreshToken, {
                publicKey,
                algorithms: ['RS256'],
            });
        }
        catch {
            throw new common_1.UnauthorizedException('Token de refresco inválido');
        }
        const tokenHash = await this.hashToken(dto.refreshToken);
        const stored = await this.prisma.refreshToken.findUnique({
            where: { tokenHash },
        });
        if (!stored)
            throw new common_1.UnauthorizedException('Token de refresco inválido');
        if (stored.isRevoked) {
            await this.prisma.refreshToken.updateMany({
                where: { family: stored.family },
                data: { isRevoked: true },
            });
            throw new common_1.UnauthorizedException('Token de refresco reutilizado — sesión revocada');
        }
        await this.prisma.refreshToken.update({
            where: { id: stored.id },
            data: { isRevoked: true },
        });
        const user = await this.prisma.webUser.findUniqueOrThrow({ where: { id: stored.userId } });
        return this.issueTokenPair(user.id, user.email, user.type, stored.family);
    }
    async createGuestSession(dto) {
        const sessionToken = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
        await this.prisma.guestSession.create({
            data: {
                sessionToken,
                email: dto.email,
                fullName: dto.fullName,
                expiresAt,
            },
        });
        return { sessionToken, expiresAt: expiresAt.toISOString() };
    }
    async validateGuestSession(token) {
        const session = await this.prisma.guestSession.findUnique({
            where: { sessionToken: token },
        });
        if (!session || session.expiresAt < new Date()) {
            throw new common_1.UnauthorizedException('Sesión de invitado expirada');
        }
        return session;
    }
    async verifyEmail(token) {
        const record = await this.prisma.emailVerification.findUnique({ where: { token } });
        if (!record || record.expiresAt < new Date()) {
            throw new common_1.BadRequestException('Enlace de verificación inválido o expirado');
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
    async forgotPassword(dto) {
        const user = await this.prisma.webUser.findUnique({ where: { email: dto.email } });
        if (!user)
            return { message: 'Si el email existe, recibirás un enlace' };
        const token = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
        await this.prisma.passwordReset.create({
            data: { userId: user.id, token, expiresAt },
        });
        this.logger.log(`Password reset token for ${dto.email}: ${token}`);
        return { message: 'Si el email existe, recibirás un enlace' };
    }
    async resetPassword(dto) {
        const record = await this.prisma.passwordReset.findUnique({ where: { token: dto.token } });
        if (!record || record.expiresAt < new Date()) {
            throw new common_1.BadRequestException('Enlace de recuperación inválido o expirado');
        }
        if (record.usedAt) {
            throw new common_1.BadRequestException('Este enlace ya fue utilizado');
        }
        const passwordHash = await bcrypt.hash(dto.password, 12);
        await this.prisma.$transaction([
            this.prisma.passwordReset.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
            this.prisma.webUser.update({ where: { id: record.userId }, data: { passwordHash } }),
            this.prisma.refreshToken.updateMany({ where: { userId: record.userId }, data: { isRevoked: true } }),
        ]);
        return { message: 'Contraseña actualizada exitosamente' };
    }
    async getFullProfile(userId) {
        const user = await this.prisma.webUser.findUnique({
            where: { id: userId },
            include: { addresses: { where: { isDefault: true }, take: 1 } },
        });
        if (!user)
            throw new common_1.NotFoundException('User not found');
        const addr = user.addresses[0];
        return {
            id: user.id,
            name: user.fullName ?? '',
            email: user.email,
            phone: user.phone ?? '',
            type: user.type.toLowerCase(),
            dob: user.dob ? user.dob.toISOString().slice(0, 10) : undefined,
            ruc: user.docType === 'RUC' ? user.docNumber : undefined,
            razonSocial: user.type === 'B2B' ? user.fullName : undefined,
            address: addr ? {
                street: addr.addressLine1,
                district: addr.district,
                city: addr.province ?? 'Lima',
                reference: addr.addressLine2 ?? undefined,
            } : undefined,
        };
    }
    async updateProfile(userId, dto) {
        const updateData = {};
        if (dto.fullName !== undefined)
            updateData.fullName = dto.fullName;
        if (dto.phone !== undefined)
            updateData.phone = dto.phone;
        if (dto.dob !== undefined)
            updateData.dob = new Date(dto.dob);
        if (dto.docType !== undefined)
            updateData.docType = dto.docType;
        if (dto.docNumber !== undefined)
            updateData.docNumber = dto.docNumber;
        await this.prisma.webUser.update({ where: { id: userId }, data: updateData });
        if (dto.addressLine1 || dto.district) {
            const existing = await this.prisma.webUserAddress.findFirst({
                where: { userId, isDefault: true },
            });
            const addrData = {
                userId,
                label: dto.addressLabel ?? 'Casa',
                addressLine1: dto.addressLine1 ?? '',
                district: dto.district ?? '',
                province: dto.province,
                isDefault: true,
            };
            if (existing) {
                await this.prisma.webUserAddress.update({ where: { id: existing.id }, data: addrData });
            }
            else {
                await this.prisma.webUserAddress.create({ data: addrData });
            }
        }
        return this.getFullProfile(userId);
    }
    async logout(refreshToken) {
        const tokenHash = await this.hashToken(refreshToken);
        await this.prisma.refreshToken.updateMany({
            where: { tokenHash },
            data: { isRevoked: true },
        });
    }
    async issueTokenPair(userId, email, type, family = (0, uuid_1.v4)()) {
        const privKeyB64 = this.config.getOrThrow('JWT_PRIVATE_KEY');
        const privateKey = Buffer.from(privKeyB64, 'base64').toString('utf-8');
        const accessExpiresIn = this.config.get('JWT_ACCESS_EXPIRES') ?? '15m';
        const refreshExpiresIn = this.config.get('JWT_REFRESH_EXPIRES') ?? '7d';
        const payload = { sub: userId, email, type };
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
        const tokenHash = await this.hashToken(refreshToken);
        const expiresAt = new Date(Date.now() + this.parseDuration(refreshExpiresIn));
        await this.prisma.refreshToken.create({
            data: { userId, tokenHash, family, expiresAt },
        });
        return { accessToken, refreshToken, expiresIn: this.parseDuration(accessExpiresIn) / 1000 };
    }
    async hashToken(token) {
        return crypto.createHash('sha256').update(token).digest('hex');
    }
    parseDuration(duration) {
        const units = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
        const match = duration.match(/^(\d+)([smhd])$/);
        if (!match)
            throw new Error(`Invalid duration: ${duration}`);
        return parseInt(match[1]) * units[match[2]];
    }
    async queueEmailVerification(userId, email) {
        const token = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
        await this.prisma.emailVerification.create({ data: { userId, token, expiresAt } });
        this.logger.log(`[DEV] Email verification token for ${email}: ${token}`);
    }
};
exports.AuthService = AuthService;
exports.AuthService = AuthService = AuthService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        jwt_1.JwtService,
        config_1.ConfigService])
], AuthService);
//# sourceMappingURL=auth.service.js.map