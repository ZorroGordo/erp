import { AuthService } from './auth.service';
import { type RegisterDto, type LoginDto, type RefreshDto, type GuestDto, type ForgotPasswordDto, type ResetPasswordDto, type UpdateProfileDto } from './auth.dto';
export declare class AuthController {
    private readonly auth;
    constructor(auth: AuthService);
    register(dto: RegisterDto): Promise<import("./auth.dto").AuthTokensDto>;
    login(dto: LoginDto): Promise<import("./auth.dto").AuthTokensDto>;
    refresh(dto: RefreshDto): Promise<import("./auth.dto").AuthTokensDto>;
    guest(dto: GuestDto): Promise<import("./auth.dto").GuestSessionDto>;
    verifyEmail(token: string): Promise<{
        message: string;
    }>;
    forgotPassword(dto: ForgotPasswordDto): Promise<{
        message: string;
    }>;
    resetPassword(dto: ResetPasswordDto): Promise<{
        message: string;
    }>;
    logout(dto: RefreshDto): Promise<void>;
    me(req: any): Promise<{
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
    updateProfile(req: any, dto: UpdateProfileDto): Promise<{
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
}
