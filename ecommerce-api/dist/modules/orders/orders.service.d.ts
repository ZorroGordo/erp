import { PrismaService } from '../../database/prisma.service';
import type { UpdateOrderStatusDto, ListOrdersQueryDto } from './orders.dto';
export declare class OrdersService {
    private readonly prisma;
    private readonly logger;
    constructor(prisma: PrismaService);
    listOrders(userId: string, query: ListOrdersQueryDto): Promise<{
        data: ({
            invoice: {
                number: number;
                type: string;
                series: string;
                s3Url: string | null;
            } | null;
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
            payments: {
                status: import(".prisma/client").$Enums.PaymentStatus;
                culqiChargeId: string | null;
                amountCentimos: number;
            }[];
        } & {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            userId: string | null;
            igvAmount: import("@prisma/client/runtime/library").Decimal;
            status: import(".prisma/client").$Enums.OrderStatus;
            deliveryDate: Date;
            deliveryWindow: import(".prisma/client").$Enums.DeliveryWindow;
            addressId: string | null;
            guestEmail: string | null;
            guestPhone: string | null;
            notes: string | null;
            promoCode: string | null;
            orderNumber: string;
            deliveryAddressSnap: import("@prisma/client/runtime/library").JsonValue | null;
            subtotalExIgv: import("@prisma/client/runtime/library").Decimal;
            totalPen: import("@prisma/client/runtime/library").Decimal;
            erpSalesOrderId: string | null;
            discountAmount: import("@prisma/client/runtime/library").Decimal;
            subscriptionId: string | null;
        })[];
        meta: {
            page: number;
            limit: number;
            total: number;
            pages: number;
        };
    }>;
    getOrder(orderId: string, userId?: string): Promise<{
        invoice: {
            number: number;
            type: string;
            id: string;
            orderId: string;
            series: string;
            s3Key: string;
            s3Url: string | null;
            issuedAt: Date;
        } | null;
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
        address: {
            addressLine1: string;
            district: string;
            province: string | null;
            id: string;
            userId: string;
            isDefault: boolean;
            label: string;
            addressLine2: string | null;
            department: string | null;
        } | null;
        payments: {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            status: import(".prisma/client").$Enums.PaymentStatus;
            orderId: string;
            culqiChargeId: string | null;
            culqiOrderId: string | null;
            amountCentimos: number;
            currency: string;
            failureReason: string | null;
            refundedAt: Date | null;
        }[];
        statusHistory: {
            id: string;
            createdAt: Date;
            status: import(".prisma/client").$Enums.OrderStatus;
            orderId: string;
            note: string | null;
            changedBy: string | null;
        }[];
    } & {
        id: string;
        createdAt: Date;
        updatedAt: Date;
        userId: string | null;
        igvAmount: import("@prisma/client/runtime/library").Decimal;
        status: import(".prisma/client").$Enums.OrderStatus;
        deliveryDate: Date;
        deliveryWindow: import(".prisma/client").$Enums.DeliveryWindow;
        addressId: string | null;
        guestEmail: string | null;
        guestPhone: string | null;
        notes: string | null;
        promoCode: string | null;
        orderNumber: string;
        deliveryAddressSnap: import("@prisma/client/runtime/library").JsonValue | null;
        subtotalExIgv: import("@prisma/client/runtime/library").Decimal;
        totalPen: import("@prisma/client/runtime/library").Decimal;
        erpSalesOrderId: string | null;
        discountAmount: import("@prisma/client/runtime/library").Decimal;
        subscriptionId: string | null;
    }>;
    getStatusHistory(orderId: string, userId?: string): Promise<{
        id: string;
        createdAt: Date;
        status: import(".prisma/client").$Enums.OrderStatus;
        orderId: string;
        note: string | null;
        changedBy: string | null;
    }[]>;
    updateStatus(orderId: string, dto: UpdateOrderStatusDto, changedBy?: string): Promise<{
        invoice: {
            number: number;
            type: string;
            id: string;
            orderId: string;
            series: string;
            s3Key: string;
            s3Url: string | null;
            issuedAt: Date;
        } | null;
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
        address: {
            addressLine1: string;
            district: string;
            province: string | null;
            id: string;
            userId: string;
            isDefault: boolean;
            label: string;
            addressLine2: string | null;
            department: string | null;
        } | null;
        payments: {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            status: import(".prisma/client").$Enums.PaymentStatus;
            orderId: string;
            culqiChargeId: string | null;
            culqiOrderId: string | null;
            amountCentimos: number;
            currency: string;
            failureReason: string | null;
            refundedAt: Date | null;
        }[];
        statusHistory: {
            id: string;
            createdAt: Date;
            status: import(".prisma/client").$Enums.OrderStatus;
            orderId: string;
            note: string | null;
            changedBy: string | null;
        }[];
    } & {
        id: string;
        createdAt: Date;
        updatedAt: Date;
        userId: string | null;
        igvAmount: import("@prisma/client/runtime/library").Decimal;
        status: import(".prisma/client").$Enums.OrderStatus;
        deliveryDate: Date;
        deliveryWindow: import(".prisma/client").$Enums.DeliveryWindow;
        addressId: string | null;
        guestEmail: string | null;
        guestPhone: string | null;
        notes: string | null;
        promoCode: string | null;
        orderNumber: string;
        deliveryAddressSnap: import("@prisma/client/runtime/library").JsonValue | null;
        subtotalExIgv: import("@prisma/client/runtime/library").Decimal;
        totalPen: import("@prisma/client/runtime/library").Decimal;
        erpSalesOrderId: string | null;
        discountAmount: import("@prisma/client/runtime/library").Decimal;
        subscriptionId: string | null;
    }>;
    listAllOrders(query: ListOrdersQueryDto): Promise<{
        data: ({
            user: {
                email: string;
                fullName: string | null;
            } | null;
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
            payments: {
                status: import(".prisma/client").$Enums.PaymentStatus;
                culqiChargeId: string | null;
            }[];
        } & {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            userId: string | null;
            igvAmount: import("@prisma/client/runtime/library").Decimal;
            status: import(".prisma/client").$Enums.OrderStatus;
            deliveryDate: Date;
            deliveryWindow: import(".prisma/client").$Enums.DeliveryWindow;
            addressId: string | null;
            guestEmail: string | null;
            guestPhone: string | null;
            notes: string | null;
            promoCode: string | null;
            orderNumber: string;
            deliveryAddressSnap: import("@prisma/client/runtime/library").JsonValue | null;
            subtotalExIgv: import("@prisma/client/runtime/library").Decimal;
            totalPen: import("@prisma/client/runtime/library").Decimal;
            erpSalesOrderId: string | null;
            discountAmount: import("@prisma/client/runtime/library").Decimal;
            subscriptionId: string | null;
        })[];
        meta: {
            page: number;
            limit: number;
            total: number;
            pages: number;
        };
    }>;
}
