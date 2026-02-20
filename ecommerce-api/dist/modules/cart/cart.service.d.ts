import { PrismaService } from '../../database/prisma.service';
import { CatalogService } from '../catalog/catalog.service';
import type { AddToCartDto, UpdateCartItemDto } from './cart.dto';
export declare class CartService {
    private readonly prisma;
    private readonly catalog;
    private readonly logger;
    constructor(prisma: PrismaService, catalog: CatalogService);
    getOrCreateCartForUser(userId: string): Promise<{
        items: {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            name: string;
            unitPrice: import("@prisma/client/runtime/library").Decimal;
            erpProductId: string;
            sku: string;
            igvRate: import("@prisma/client/runtime/library").Decimal;
            qty: number;
            cartId: string;
        }[];
    } & {
        id: string;
        createdAt: Date;
        updatedAt: Date;
        userId: string | null;
        guestSessionId: string | null;
    }>;
    getOrCreateCartForGuest(guestSessionId: string): Promise<{
        items: {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            name: string;
            unitPrice: import("@prisma/client/runtime/library").Decimal;
            erpProductId: string;
            sku: string;
            igvRate: import("@prisma/client/runtime/library").Decimal;
            qty: number;
            cartId: string;
        }[];
    } & {
        id: string;
        createdAt: Date;
        updatedAt: Date;
        userId: string | null;
        guestSessionId: string | null;
    }>;
    getCart(opts: {
        userId?: string;
        guestSessionId?: string;
        userType?: 'B2C' | 'B2B' | 'GUEST';
    }): Promise<{
        cartId: string;
        items: {
            id: string;
            erpProductId: string;
            sku: string;
            name: string;
            qty: number;
            unitPrice: string;
            igvAmount: string;
            totalUnitPrice: string;
            lineTotal: string;
        }[];
        subtotalExIgv: string;
        igvTotal: string;
        total: string;
    }>;
    addItem(cartOpts: {
        userId?: string;
        guestSessionId?: string;
        userType?: 'B2C' | 'B2B' | 'GUEST';
    }, dto: AddToCartDto): Promise<{
        cartId: string;
        items: {
            id: string;
            erpProductId: string;
            sku: string;
            name: string;
            qty: number;
            unitPrice: string;
            igvAmount: string;
            totalUnitPrice: string;
            lineTotal: string;
        }[];
        subtotalExIgv: string;
        igvTotal: string;
        total: string;
    }>;
    updateItem(cartOpts: {
        userId?: string;
        guestSessionId?: string;
        userType?: 'B2C' | 'B2B' | 'GUEST';
    }, erpProductId: string, dto: UpdateCartItemDto): Promise<{
        cartId: string;
        items: {
            id: string;
            erpProductId: string;
            sku: string;
            name: string;
            qty: number;
            unitPrice: string;
            igvAmount: string;
            totalUnitPrice: string;
            lineTotal: string;
        }[];
        subtotalExIgv: string;
        igvTotal: string;
        total: string;
    }>;
    removeItem(cartOpts: {
        userId?: string;
        guestSessionId?: string;
    }, erpProductId: string): Promise<{
        cartId: string;
        items: {
            id: string;
            erpProductId: string;
            sku: string;
            name: string;
            qty: number;
            unitPrice: string;
            igvAmount: string;
            totalUnitPrice: string;
            lineTotal: string;
        }[];
        subtotalExIgv: string;
        igvTotal: string;
        total: string;
    }>;
    clearCart(cartId: string): Promise<void>;
    mergeGuestCart(userId: string, guestToken: string): Promise<void>;
}
