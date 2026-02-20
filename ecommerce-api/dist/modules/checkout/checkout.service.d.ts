import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';
import { CartService } from '../cart/cart.service';
import type { Env } from '../../config/configuration';
import type { InitiateCheckoutDto } from './checkout.dto';
import type { DeliveryWindow, Prisma } from '@prisma/client';
export declare class CheckoutService {
    private readonly prisma;
    private readonly cart;
    private readonly config;
    private readonly logger;
    private readonly culqiSecret;
    constructor(prisma: PrismaService, cart: CartService, config: ConfigService<Env>);
    getAvailableSlots(from: string, to: string): Promise<{
        date: string;
        window: DeliveryWindow;
        available: boolean;
        remaining: number;
    }[]>;
    validateCart(cartOpts: {
        userId?: string;
        guestSessionId?: string;
        userType?: 'B2C' | 'B2B' | 'GUEST';
    }, deliveryDate: string, deliveryWindow: DeliveryWindow): Promise<{
        valid: boolean;
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
        slotAvailable: true;
    }>;
    initiateCheckout(cartOpts: {
        userId?: string;
        guestSessionId?: string;
        userType?: 'B2C' | 'B2B' | 'GUEST';
    }, dto: InitiateCheckoutDto): Promise<{
        orderId: string;
        orderNumber: string;
        amountCentimos: number;
        culqiOrderId: string | null;
        culqiPublicKey: string | undefined;
        items: {
            id: string;
            name: string;
            unitPrice: Prisma.Decimal;
            erpProductId: string;
            sku: string;
            igvRate: Prisma.Decimal;
            qty: number;
            lineTotal: Prisma.Decimal;
            orderId: string;
        }[];
    }>;
    private createCulqiOrder;
    createDirectOrder(payload: {
        userId?: string;
        guestEmail?: string;
        guestPhone?: string;
        items: Array<{
            erpProductId: string;
            name: string;
            sku: string;
            qty: number;
            unitPrice: number;
            igvRate: number;
            isSubscription?: boolean;
        }>;
        deliveryDate: string;
        deliveryWindow: DeliveryWindow;
        addressSnap: Prisma.JsonObject;
        addressId?: string;
        invoiceType?: string;
        ruc?: string;
        razonSocial?: string;
        notes?: string;
        promoCode?: string;
    }): Promise<{
        orderId: string;
        orderNumber: string;
        amountCentimos: number;
        items: {
            id: string;
            name: string;
            unitPrice: Prisma.Decimal;
            erpProductId: string;
            sku: string;
            igvRate: Prisma.Decimal;
            qty: number;
            lineTotal: Prisma.Decimal;
            orderId: string;
        }[];
    }>;
}
