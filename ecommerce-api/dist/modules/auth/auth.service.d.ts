import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';
import type { Env } from '../../config/configuration';
import type { RegisterDto, LoginDto, RefreshDto, GuestDto, ForgotPasswordDto, ResetPasswordDto, AuthTokensDto, GuestSessionDto } from './auth.dto';
export declare class AuthService {
    private readonly prisma;
    private readonly jwtService;
    private readonly config;
    private readonly logger;
    constructor(prisma: PrismaService, jwtService: JwtService, config: ConfigService<Env>);
    register(dto: RegisterDto): Promise<AuthTokensDto>;
    login(dto: LoginDto): Promise<AuthTokensDto>;
    refresh(dto: RefreshDto): Promise<AuthTokensDto>;
    createGuestSession(dto: GuestDto): Promise<GuestSessionDto>;
    validateGuestSession(token: string): Promise<{
        email: string | null;
        fullName: string | null;
        phone: string | null;
        docType: import(".prisma/client").$Enums.DocType | null;
        docNumber: string | null;
        id: string;
        createdAt: Date;
        expiresAt: Date;
        sessionToken: string;
    }>;
    verifyEmail(token: string): Promise<{
        message: string;
    }>;
    forgotPassword(dto: ForgotPasswordDto): Promise<{
        message: string;
    }>;
    resetPassword(dto: ResetPasswordDto): Promise<{
        message: string;
    }>;
    getFullProfile(userId: string): Promise<{
        id: string;
        name: string;
        email: string;
        phone: string;
        type: "b2c" | "b2b";
        dob: string | undefined;
        ruc: string | null | undefined;
        razonSocial: string | null | undefined;
        address: {
            street: string;
            district: string;
            city: string;
            reference: string | undefined;
        } | undefined;
    }>;
    updateProfile(userId: string, dto: import('./auth.dto').UpdateProfileDto): Promise<{
        id: string;
        name: string;
        email: string;
        phone: string;
        type: "b2c" | "b2b";
        dob: string | undefined;
        ruc: string | null | undefined;
        razonSocial: string | null | undefined;
        address: {
            street: string;
            district: string;
            city: string;
            reference: string | undefined;
        } | undefined;
    }>;
    logout(refreshToken: string): Promise<void>;
    private issueTokenPair;
    private hashToken;
    private parseDuration;
    private queueEmailVerification;
}
