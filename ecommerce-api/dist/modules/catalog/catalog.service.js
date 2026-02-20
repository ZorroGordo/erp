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
Object.defineProperty(exports, "__esModule", { value: true });
exports.CatalogService = void 0;
const common_1 = require("@nestjs/common");
const erp_adapter_service_1 = require("../erp-adapter/erp-adapter.service");
const prisma_service_1 = require("../../database/prisma.service");
const pricing_service_1 = require("./pricing.service");
let CatalogService = class CatalogService {
    erp;
    prisma;
    pricing;
    constructor(erp, prisma, pricing) {
        this.erp = erp;
        this.prisma = prisma;
        this.pricing = pricing;
    }
    async getCatalog(opts) {
        const [products, { agreements, hasSubscription }] = await Promise.all([
            this.erp.getPublicProducts(),
            this.getUserPricingContext(opts.userId, opts.userType),
        ]);
        let filtered = products;
        if (opts.search) {
            const q = opts.search.toLowerCase();
            filtered = filtered.filter((p) => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q));
        }
        if (opts.categoryId) {
            filtered = filtered.filter((p) => p.category.id === opts.categoryId);
        }
        const priced = this.pricing.priceProducts(filtered, agreements, hasSubscription);
        const items = priced.map((item, i) => ({
            ...item,
            category: filtered[i].category,
            imageUrl: filtered[i].imageUrl,
            unitOfSale: filtered[i].unitOfSale,
            minOrderQty: filtered[i].minOrderQty,
        }));
        return {
            products: items,
            userType: opts.userType ?? 'GUEST',
            hasSubscription,
        };
    }
    async getProduct(productId, opts = {}) {
        const [product, { agreements, hasSubscription }] = await Promise.all([
            this.erp.getProductById(productId),
            this.getUserPricingContext(opts.userId, opts.userType),
        ]);
        if (!product)
            throw new common_1.NotFoundException('Producto no encontrado');
        const [priced] = this.pricing.priceProducts([product], agreements, hasSubscription);
        return {
            ...priced,
            category: product.category,
            imageUrl: product.imageUrl,
            unitOfSale: product.unitOfSale,
            minOrderQty: product.minOrderQty,
        };
    }
    async getCategories() {
        return this.erp.getCategories();
    }
    async getUserPricingContext(userId, userType) {
        if (!userId || userType !== 'B2B') {
            const hasSubscription = userId ? await this.hasActiveSubscription(userId) : false;
            return { agreements: [], hasSubscription };
        }
        const user = await this.prisma.webUser.findUnique({
            where: { id: userId },
            select: { erpCustomerId: true },
        });
        if (!user?.erpCustomerId) {
            return { agreements: [], hasSubscription: false };
        }
        const [agreements, hasSubscription] = await Promise.all([
            this.erp.getCustomerPriceAgreements(user.erpCustomerId),
            this.hasActiveSubscription(userId),
        ]);
        return { agreements, hasSubscription };
    }
    async hasActiveSubscription(userId) {
        const count = await this.prisma.subscription.count({
            where: { userId, status: 'ACTIVE' },
        });
        return count > 0;
    }
};
exports.CatalogService = CatalogService;
exports.CatalogService = CatalogService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [erp_adapter_service_1.ErpAdapterService,
        prisma_service_1.PrismaService,
        pricing_service_1.PricingService])
], CatalogService);
//# sourceMappingURL=catalog.service.js.map