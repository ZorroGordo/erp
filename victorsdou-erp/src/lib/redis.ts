import Redis from 'ioredis';
import { config } from '../config';

export const redis = new Redis(config.REDIS_URL, {
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  lazyConnect: true,
});

redis.on('error', (err) => {
  console.error('[Redis] Connection error:', err.message);
});

redis.on('ready', () => {
  console.info('[Redis] Connected');
});

// ── Helpers ──────────────────────────────────────────────────────────────────

export async function getCache<T>(key: string): Promise<T | null> {
  const value = await redis.get(key);
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

export async function setCache<T>(
  key: string,
  value: T,
  ttlSeconds = 300,
): Promise<void> {
  await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
}

export async function deleteCache(pattern: string): Promise<void> {
  const keys = await redis.keys(pattern);
  if (keys.length > 0) {
    await redis.del(...keys);
  }
}

export const CACHE_KEYS = {
  catalog: () => 'catalog:products:public',
  productDetail: (sku: string) => `catalog:product:${sku}`,
  customerPriceList: (customerId: string) => `pricing:customer:${customerId}`,
  forecastCurrent: () => 'ai:forecast:current',
  inventorySnapshot: () => 'inventory:snapshot',
} as const;
