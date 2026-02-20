import { OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import type { Env } from '../config/configuration';
export declare class RedisService implements OnModuleInit, OnModuleDestroy {
    private readonly config;
    private readonly logger;
    private client;
    constructor(config: ConfigService<Env>);
    onModuleInit(): void;
    onModuleDestroy(): Promise<void>;
    get raw(): Redis;
    get<T>(key: string): Promise<T | null>;
    set<T>(key: string, value: T, ttlSeconds?: number): Promise<void>;
    del(...keys: string[]): Promise<void>;
    delPattern(pattern: string): Promise<number>;
    getOrSet<T>(key: string, loader: () => Promise<T>, ttlSeconds: number): Promise<T>;
}
