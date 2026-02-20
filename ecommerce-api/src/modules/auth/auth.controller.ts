import {
  Controller, Post, Put, Body, HttpCode, HttpStatus,
  Get, Query, UseGuards, Req,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthGuard } from '@nestjs/passport';
import {
  RegisterSchema, LoginSchema, RefreshSchema, GuestSchema,
  ForgotPasswordSchema, ResetPasswordSchema, UpdateProfileSchema,
  type RegisterDto, type LoginDto, type RefreshDto, type GuestDto,
  type ForgotPasswordDto, type ResetPasswordDto, type UpdateProfileDto,
} from './auth.dto';
import { ZodPipe } from '../../common/pipes/zod.pipe';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /** POST /auth/register */
  @Post('register')
  async register(@Body(new ZodPipe(RegisterSchema)) dto: RegisterDto) {
    return this.auth.register(dto);
  }

  /** POST /auth/login */
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body(new ZodPipe(LoginSchema)) dto: LoginDto) {
    return this.auth.login(dto);
  }

  /** POST /auth/refresh */
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body(new ZodPipe(RefreshSchema)) dto: RefreshDto) {
    return this.auth.refresh(dto);
  }

  /** POST /auth/guest — creates an anonymous checkout session */
  @Post('guest')
  async guest(@Body(new ZodPipe(GuestSchema)) dto: GuestDto) {
    return this.auth.createGuestSession(dto);
  }

  /** GET /auth/verify-email?token=... */
  @Get('verify-email')
  async verifyEmail(@Query('token') token: string) {
    return this.auth.verifyEmail(token);
  }

  /** POST /auth/forgot-password */
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  async forgotPassword(@Body(new ZodPipe(ForgotPasswordSchema)) dto: ForgotPasswordDto) {
    return this.auth.forgotPassword(dto);
  }

  /** POST /auth/reset-password */
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  async resetPassword(@Body(new ZodPipe(ResetPasswordSchema)) dto: ResetPasswordDto) {
    return this.auth.resetPassword(dto);
  }

  /** POST /auth/logout */
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(AuthGuard('jwt'))
  async logout(@Body(new ZodPipe(RefreshSchema)) dto: RefreshDto) {
    return this.auth.logout(dto.refreshToken);
  }

  /** GET /auth/me — returns full user profile */
  @Get('me')
  @UseGuards(AuthGuard('jwt'))
  async me(@Req() req: any) {
    return this.auth.getFullProfile(req.user.id);
  }

  /** PUT /auth/profile — update user profile */
  @Put('profile')
  @UseGuards(AuthGuard('jwt'))
  async updateProfile(
    @Req() req: any,
    @Body(new ZodPipe(UpdateProfileSchema)) dto: UpdateProfileDto,
  ) {
    return this.auth.updateProfile(req.user.id, dto);
  }
}
