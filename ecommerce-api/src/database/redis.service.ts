import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import type { Env } from '../config/configuration';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis;

  constructor(private readonly config: ConfigService<Env>) {}

  onModuleInit(): void {
    const url = this.config.get('REDIS_URL') ?? 'redis://localhost:6379';
    this.client = new Redis(url, {
      maxRetriesPerRequest: 3,
      lazyConnect: false,
    });
    this.client.on('connect',  ()    => this.logger.log('Redis connected'));
    this.client.on('error',    (err) => this.logger.error('Redis error', err));
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit();
  }

  /** Raw ioredis client — use for advanced ops (pipelines, pub/sub) */
  get raw(): Redis { return this.client; }

  // ─── Key/Value helpers ────────────────────────────────────────────────────

  async get<T>(key: string): Promise<T | null> {
    const val = await this.client.get(key);
    if (val === null) return null;
    try { return JSON.parse(val) as T; }
    catch { return val as unknown as T; }
  }

  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    const serialized = JSON.stringify(value);
    if (ttlSeconds) {
      await this.client.set(key, serialized, 'EX', ttlSeconds);
    } else {
      await this.client.set(key, serialized);
    }
  }

  async del(...keys: string[]): Promise<void> {
    if (keys.length > 0) await this.client.del(...keys);
  }

  /** Delete all keys matching a glob pattern (e.g. 'catalog:product:*') */
  async delPattern(pattern: string): Promise<number> {
    const keys = await this.client.keys(pattern);
    if (keys.length === 0) return 0;
    await this.client.del(...keys);
    return keys.length;
  }

  /** Read-through: return cached value or call loader and cache result */
  async getOrSet<T>(
    key: string,
    loader: () => Promise<T>,
    ttlSeconds: number,
  ): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) return cached;

    const fresh = await loader();
    await this.set(key, fresh, ttlSeconds);
    return fresh;
  }
}
