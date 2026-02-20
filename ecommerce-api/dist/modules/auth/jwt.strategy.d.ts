import { Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';
import type { Env } from '../../config/configuration';
export interface JwtPayload {
    sub: string;
    email: string;
    type: 'B2C' | 'B2B';
    iat?: number;
    exp?: number;
}
declare const JwtStrategy_base: new (...args: [opt: import("passport-jwt").StrategyOptionsWithRequest] | [opt: import("passport-jwt").StrategyOptionsWithoutRequest]) => Strategy & {
    validate(...args: any[]): unknown;
};
export declare class JwtStrategy extends JwtStrategy_base {
    private readonly prisma;
    constructor(config: ConfigService<Env>, prisma: PrismaService);
    validate(payload: JwtPayload): Promise<{
        type: import(".prisma/client").$Enums.UserType;
        email: string;
        id: string;
        isActive: boolean;
    }>;
}
export {};
