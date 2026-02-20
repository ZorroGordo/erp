import { CartService } from './cart.service';
import { type AddToCartDto, type UpdateCartItemDto, type MergeCartDto } from './cart.dto';
export declare class CartController {
    private readonly cart;
    constructor(cart: CartService);
    getCart(req: any): Promise<{
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
    } | {
        cartId: null;
        items: never[];
        subtotalExIgv: string;
        igvTotal: string;
        total: string;
    }>;
    addItem(req: any, dto: AddToCartDto): Promise<{
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
    updateItem(req: any, erpProductId: string, dto: UpdateCartItemDto): Promise<{
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
    removeItem(req: any, erpProductId: string): Promise<{
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
    mergeCart(req: any, dto: MergeCartDto): Promise<{
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
}
