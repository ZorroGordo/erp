"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var ErpAdapterService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ErpAdapterService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const redis_service_1 = require("../../database/redis.service");
const TTL = {
    PRODUCT_LIST: 60 * 15,
    PRODUCT_SINGLE: 60 * 10,
    CATEGORIES: 60 * 30,
    B2B_PRICES: 60 * 15,
    SERVICE_TOKEN: 60 * 13,
};
const CACHE = {
    products: () => 'erp:catalog:products',
    product: (id) => `erp:catalog:product:${id}`,
    categories: () => 'erp:catalog:categories',
    b2bPrices: (customerId) => `erp:b2b:prices:${customerId}`,
    serviceToken: () => 'erp:service:token',
};
let ErpAdapterService = ErpAdapterService_1 = class ErpAdapterService {
    config;
    redis;
    logger = new common_1.Logger(ErpAdapterService_1.name);
    baseUrl;
    constructor(config, redis) {
        this.config = config;
        this.redis = redis;
        this.baseUrl = (this.config.get('ERP_API_URL') ?? 'http://localhost:3000') + '/v1';
    }
    async getPublicProducts() {
        return this.redis.getOrSet(CACHE.products(), async () => {
            const data = await this.erpFetch('/products/public');
            return data.data;
        }, TTL.PRODUCT_LIST);
    }
    async getProductById(id) {
        return this.redis.getOrSet(CACHE.product(id), async () => {
            const list = await this.redis.get(CACHE.products());
            if (list) {
                return list.find((p) => p.id === id) ?? null;
            }
            const products = await this.getPublicProducts();
            return products.find((p) => p.id === id) ?? null;
        }, TTL.PRODUCT_SINGLE);
    }
    async getAllProducts() {
        return this.redis.getOrSet(CACHE.products(), async () => {
            const token = await this.getServiceToken();
            const data = await this.erpFetch('/products', { token });
            return data.data;
        }, TTL.PRODUCT_LIST);
    }
    async getCategories() {
        return this.redis.getOrSet(CACHE.categories(), async () => {
            const token = await this.getServiceToken();
            const data = await this.erpFetch('/products/categories', { token });
            return data.data;
        }, TTL.CATEGORIES);
    }
    async getCustomerPriceAgreements(erpCustomerId) {
        return this.redis.getOrSet(CACHE.b2bPrices(erpCustomerId), async () => {
            const token = await this.getServiceToken();
            const now = new Date().toISOString();
            const data = await this.erpFetch(`/customers/${erpCustomerId}/price-agreements?effectiveTo_gte=${now}`, { token });
            return data.data;
        }, TTL.B2B_PRICES);
    }
    async invalidateProductCache() {
        await this.redis.del(CACHE.products());
        await this.redis.delPattern('erp:catalog:product:*');
        this.logger.log('Product cache invalidated');
    }
    async invalidateB2BPriceCache(erpCustomerId) {
        await this.redis.del(CACHE.b2bPrices(erpCustomerId));
        this.logger.log(`B2B price cache invalidated for customer ${erpCustomerId}`);
    }
    async getServiceToken() {
        const cached = await this.redis.get(CACHE.serviceToken());
        if (cached)
            return cached;
        const erpUrl = this.config.getOrThrow('ERP_API_URL');
        const apiKey = this.config.getOrThrow('ERP_API_KEY');
        const serviceEmail = 'ecommerce-service@victorsdou.internal';
        try {
            const res = await fetch(`${erpUrl}/v1/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: serviceEmail, password: apiKey }),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new common_1.UnauthorizedException(`ERP service login failed: ${err?.error ?? res.statusText}`);
            }
            const body = await res.json();
            const token = body.data.tokens.accessToken;
            await this.redis.set(CACHE.serviceToken(), token, TTL.SERVICE_TOKEN);
            this.logger.debug('ERP service token refreshed');
            return token;
        }
        catch (err) {
            if (err instanceof common_1.UnauthorizedException)
                throw err;
            this.logger.error('Failed to obtain ERP service token', err);
            throw new common_1.InternalServerErrorException('ERP authentication failed');
        }
    }
    async erpFetch(path, opts = {}) {
        const url = `${this.baseUrl}${path}`;
        const headers = {
            'Content-Type': 'application/json',
        };
        if (opts.token)
            headers['Authorization'] = `Bearer ${opts.token}`;
        const res = await fetch(url, {
            method: opts.method ?? 'GET',
            headers,
            ...(opts.body ? { body: JSON.stringify(opts.body) } : {}),
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            this.logger.error(`ERP request failed: ${opts.method ?? 'GET'} ${url} → ${res.status}`, err);
            throw new common_1.InternalServerErrorException(`ERP request failed: ${err?.error ?? res.statusText}`);
        }
        return res.json();
    }
};
exports.ErpAdapterService = ErpAdapterService;
exports.ErpAdapterService = ErpAdapterService = ErpAdapterService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService,
        redis_service_1.RedisService])
], ErpAdapterService);
//# sourceMappingURL=erp-adapter.service.js.map