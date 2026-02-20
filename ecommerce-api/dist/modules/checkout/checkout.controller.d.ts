import { CheckoutService } from './checkout.service';
import { type GetSlotsDto, type ValidateCartDto, type InitiateCheckoutDto } from './checkout.dto';
export declare class CheckoutController {
    private readonly checkout;
    constructor(checkout: CheckoutService);
    getSlots(query: GetSlotsDto): Promise<{
        date: string;
        window: import(".prisma/client").DeliveryWindow;
        available: boolean;
        remaining: number;
    }[]>;
    validate(req: any, dto: ValidateCartDto): Promise<{
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
    initiate(req: any, dto: InitiateCheckoutDto): Promise<{
        orderId: string;
        orderNumber: string;
        amountCentimos: number;
        culqiOrderId: string | null;
        culqiPublicKey: string | undefined;
        items: {
            id: string;
            name: string;
            unitPrice: import("@prisma/client/runtime/library").Decimal;
            erpProductId: string;
            sku: string;
            igvRate: import("@prisma/client/runtime/library").Decimal;
            qty: number;
            lineTotal: import("@prisma/client/runtime/library").Decimal;
            orderId: string;
        }[];
    }>;
    direct(req: any, body: any): Promise<{
        orderId: string;
        orderNumber: string;
        amountCentimos: number;
        items: {
            id: string;
            name: string;
            unitPrice: import("@prisma/client/runtime/library").Decimal;
            erpProductId: string;
            sku: string;
            igvRate: import("@prisma/client/runtime/library").Decimal;
            qty: number;
            lineTotal: import("@prisma/client/runtime/library").Decimal;
            orderId: string;
        }[];
    }>;
}
