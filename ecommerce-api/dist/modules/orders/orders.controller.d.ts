import { ConfigService } from '@nestjs/config';
import { OrdersService } from './orders.service';
import { type UpdateOrderStatusDto, type ListOrdersQueryDto } from './orders.dto';
import type { Env } from '../../config/configuration';
export declare class OrdersController {
    private readonly orders;
    private readonly config;
    constructor(orders: OrdersService, config: ConfigService<Env>);
    listMyOrders(req: any, query: ListOrdersQueryDto): Promise<{
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
    getOrder(req: any, id: string): Promise<{
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
    getStatusHistory(req: any, id: string): Promise<{
        id: string;
        createdAt: Date;
        status: import(".prisma/client").$Enums.OrderStatus;
        orderId: string;
        note: string | null;
        changedBy: string | null;
    }[]>;
    adminListOrders(key: string, query: ListOrdersQueryDto): Promise<{
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
    adminUpdateStatus(key: string, id: string, dto: UpdateOrderStatusDto): Promise<{
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
    private assertInternalKey;
}
