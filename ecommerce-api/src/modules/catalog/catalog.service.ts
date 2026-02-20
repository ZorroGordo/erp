import { Injectable, NotFoundException } from '@nestjs/common';
import { ErpAdapterService } from '../erp-adapter/erp-adapter.service';
import { PrismaService } from '../../database/prisma.service';
import { PricingService } from './pricing.service';
import type { ErpProduct } from '../erp-adapter/erp-adapter.types';
import type { PricedItem } from './pricing.service';

export interface ProductListItem extends PricedItem {
  category:   { id: string; name: string };
  imageUrl:   string | null;
  unitOfSale: string;
  minOrderQty: string;
}

export interface CatalogResponse {
  products: ProductListItem[];
  userType: 'B2C' | 'B2B' | 'GUEST';
  hasSubscription: boolean;
}

@Injectable()
export class CatalogService {
  constructor(
    private readonly erp:     ErpAdapterService,
    private readonly prisma:  PrismaService,
    private readonly pricing: PricingService,
  ) {}

  /** Get full catalogue with prices personalised to the caller */
  async getCatalog(opts: {
    userId?:    string;   // null for guests
    userType?:  'B2C' | 'B2B' | 'GUEST';
    search?:    string;
    categoryId?: string;
  }): Promise<CatalogResponse> {
    const [products, { agreements, hasSubscription }] = await Promise.all([
      this.erp.getPublicProducts(),
      this.getUserPricingContext(opts.userId, opts.userType),
    ]);

    let filtered = products;
    if (opts.search) {
      const q = opts.search.toLowerCase();
      filtered = filtered.filter(
        (p) => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q),
      );
    }
    if (opts.categoryId) {
      filtered = filtered.filter((p) => p.category.id === opts.categoryId);
    }

    const priced = this.pricing.priceProducts(filtered, agreements, hasSubscription);

    const items: ProductListItem[] = priced.map((item, i) => ({
      ...item,
      category:    filtered[i].category,
      imageUrl:    filtered[i].imageUrl,
      unitOfSale:  filtered[i].unitOfSale,
      minOrderQty: filtered[i].minOrderQty,
    }));

    return {
      products: items,
      userType: opts.userType ?? 'GUEST',
      hasSubscription,
    };
  }

  /** Single product with personalised pricing */
  async getProduct(
    productId: string,
    opts: { userId?: string; userType?: 'B2C' | 'B2B' | 'GUEST' } = {},
  ): Promise<ProductListItem> {
    const [product, { agreements, hasSubscription }] = await Promise.all([
      this.erp.getProductById(productId),
      this.getUserPricingContext(opts.userId, opts.userType),
    ]);

    if (!product) throw new NotFoundException('Producto no encontrado');

    const [priced] = this.pricing.priceProducts([product], agreements, hasSubscription);
    return {
      ...priced,
      category:    product.category,
      imageUrl:    product.imageUrl,
      unitOfSale:  product.unitOfSale,
      minOrderQty: product.minOrderQty,
    };
  }

  async getCategories() {
    return this.erp.getCategories();
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private async getUserPricingContext(
    userId?: string,
    userType?: 'B2C' | 'B2B' | 'GUEST',
  ): Promise<{ agreements: any[]; hasSubscription: boolean }> {
    if (!userId || userType !== 'B2B') {
      // B2C / guest — no agreements, check subscription
      const hasSubscription = userId ? await this.hasActiveSubscription(userId) : false;
      return { agreements: [], hasSubscription };
    }

    // B2B — look up their ERP customer ID then fetch agreements
    const user = await this.prisma.webUser.findUnique({
      where:  { id: userId },
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

  private async hasActiveSubscription(userId: string): Promise<boolean> {
    const count = await this.prisma.subscription.count({
      where: { userId, status: 'ACTIVE' },
    });
    return count > 0;
  }
}
