import { Injectable, Logger, UnauthorizedException, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../database/redis.service';
import type { Env } from '../../config/configuration';
import type { ErpProduct, ErpCategory, ErpPriceAgreement } from './erp-adapter.types';

/** TTLs for Redis caches */
const TTL = {
  PRODUCT_LIST:    60 * 15,   // 15 min  — full catalogue
  PRODUCT_SINGLE:  60 * 10,   // 10 min  — individual product
  CATEGORIES:      60 * 30,   // 30 min  — rarely changes
  B2B_PRICES:      60 * 15,   // 15 min  — per-customer price agreements
  SERVICE_TOKEN:   60 * 13,   // 13 min  — access token (expires at 15 min on ERP side)
};

const CACHE = {
  products:      () => 'erp:catalog:products',
  product:       (id: string) => `erp:catalog:product:${id}`,
  categories:    () => 'erp:catalog:categories',
  b2bPrices:     (customerId: string) => `erp:b2b:prices:${customerId}`,
  serviceToken:  () => 'erp:service:token',
};

@Injectable()
export class ErpAdapterService {
  private readonly logger = new Logger(ErpAdapterService.name);
  private baseUrl: string;

  constructor(
    private readonly config:  ConfigService<Env>,
    private readonly redis:   RedisService,
  ) {
    this.baseUrl = (this.config.get('ERP_API_URL') ?? 'http://localhost:3000') + '/v1';
  }

  // ─── Products ─────────────────────────────────────────────────────────────

  /** Returns all B2C-visible products (uses ERP's own /catalog/public, no auth) */
  async getPublicProducts(): Promise<ErpProduct[]> {
    return this.redis.getOrSet<ErpProduct[]>(
      CACHE.products(),
      async () => {
        const data = await this.erpFetch<{ data: ErpProduct[] }>('/products/public');
        return data.data;
      },
      TTL.PRODUCT_LIST,
    );
  }

  /** Single product — falls back to full list cache */
  async getProductById(id: string): Promise<ErpProduct | null> {
    return this.redis.getOrSet<ErpProduct | null>(
      CACHE.product(id),
      async () => {
        // Try to find in the cached list first (avoid an extra HTTP call)
        const list = await this.redis.get<ErpProduct[]>(CACHE.products());
        if (list) {
          return list.find((p) => p.id === id) ?? null;
        }
        // Otherwise fetch fresh
        const products = await this.getPublicProducts();
        return products.find((p) => p.id === id) ?? null;
      },
      TTL.PRODUCT_SINGLE,
    );
  }

  /** All products including B2B-only ones (requires service token) */
  async getAllProducts(): Promise<ErpProduct[]> {
    return this.redis.getOrSet<ErpProduct[]>(
      CACHE.products(),
      async () => {
        const token = await this.getServiceToken();
        const data = await this.erpFetch<{ data: ErpProduct[] }>('/products', { token });
        return data.data;
      },
      TTL.PRODUCT_LIST,
    );
  }

  // ─── Categories ───────────────────────────────────────────────────────────

  async getCategories(): Promise<ErpCategory[]> {
    return this.redis.getOrSet<ErpCategory[]>(
      CACHE.categories(),
      async () => {
        const token = await this.getServiceToken();
        const data = await this.erpFetch<{ data: ErpCategory[] }>('/products/categories', { token });
        return data.data;
      },
      TTL.CATEGORIES,
    );
  }

  // ─── B2B Price Agreements ─────────────────────────────────────────────────

  /**
   * Returns active price agreements for a B2B customer.
   * Cached per customer for 15 min; invalidated via /internal/cache/invalidate.
   */
  async getCustomerPriceAgreements(erpCustomerId: string): Promise<ErpPriceAgreement[]> {
    return this.redis.getOrSet<ErpPriceAgreement[]>(
      CACHE.b2bPrices(erpCustomerId),
      async () => {
        const token = await this.getServiceToken();
        const now   = new Date().toISOString();
        const data  = await this.erpFetch<{ data: ErpPriceAgreement[] }>(
          `/customers/${erpCustomerId}/price-agreements?effectiveTo_gte=${now}`,
          { token },
        );
        return data.data;
      },
      TTL.B2B_PRICES,
    );
  }

  // ─── Cache invalidation (called from /internal/cache/invalidate endpoint) ──

  async invalidateProductCache(): Promise<void> {
    await this.redis.del(CACHE.products());
    await this.redis.delPattern('erp:catalog:product:*');
    this.logger.log('Product cache invalidated');
  }

  async invalidateB2BPriceCache(erpCustomerId: string): Promise<void> {
    await this.redis.del(CACHE.b2bPrices(erpCustomerId));
    this.logger.log(`B2B price cache invalidated for customer ${erpCustomerId}`);
  }

  // ─── Service-to-service auth ──────────────────────────────────────────────

  /**
   * Gets (or refreshes) a service JWT for authenticating with the ERP.
   * The ERP_API_KEY env var is the password for a service account on the ERP.
   */
  private async getServiceToken(): Promise<string> {
    const cached = await this.redis.get<string>(CACHE.serviceToken());
    if (cached) return cached;

    const erpUrl    = this.config.getOrThrow('ERP_API_URL');
    const apiKey    = this.config.getOrThrow('ERP_API_KEY');
    const serviceEmail = 'ecommerce-service@victorsdou.internal';

    try {
      const res = await fetch(`${erpUrl}/v1/auth/login`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email: serviceEmail, password: apiKey }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as any;
        throw new UnauthorizedException(
          `ERP service login failed: ${err?.error ?? res.statusText}`,
        );
      }

      const body = await res.json() as { data: { tokens: { accessToken: string } } };
      const token = body.data.tokens.accessToken;

      await this.redis.set(CACHE.serviceToken(), token, TTL.SERVICE_TOKEN);
      this.logger.debug('ERP service token refreshed');
      return token;
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      this.logger.error('Failed to obtain ERP service token', err);
      throw new InternalServerErrorException('ERP authentication failed');
    }
  }

  // ─── HTTP helper ──────────────────────────────────────────────────────────

  private async erpFetch<T>(
    path: string,
    opts: { token?: string; method?: string; body?: unknown } = {},
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (opts.token) headers['Authorization'] = `Bearer ${opts.token}`;

    const res = await fetch(url, {
      method:  opts.method ?? 'GET',
      headers,
      ...(opts.body ? { body: JSON.stringify(opts.body) } : {}),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as any;
      this.logger.error(`ERP request failed: ${opts.method ?? 'GET'} ${url} → ${res.status}`, err);
      throw new InternalServerErrorException(`ERP request failed: ${err?.error ?? res.statusText}`);
    }

    return res.json() as Promise<T>;
  }
}
