import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';
import type { Env } from '../../config/configuration';

export interface JwtPayload {
  sub:   string;   // web_users.id
  email: string;
  type:  'B2C' | 'B2B';
  iat?:  number;
  exp?:  number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService<Env>,
    private readonly prisma: PrismaService,
  ) {
    // Decode base64-encoded public key stored in env
    const pubKeyB64 = config.getOrThrow('JWT_PUBLIC_KEY');
    const publicKey = Buffer.from(pubKeyB64, 'base64').toString('utf-8');

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey:    publicKey,
      algorithms:     ['RS256'],
    });
  }

  async validate(payload: JwtPayload) {
    const user = await this.prisma.webUser.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, type: true, isActive: true },
    });
    if (!user || !user.isActive) throw new UnauthorizedException();
    return user;
  }
}
