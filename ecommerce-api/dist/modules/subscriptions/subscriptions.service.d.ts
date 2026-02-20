import { PrismaService } from '../../database/prisma.service';
export declare class SubscriptionsService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    listForUser(userId: string): Promise<{
        data: ({
            items: {
                id: string;
                name: string;
                erpProductId: string;
                sku: string;
                qty: number;
                subscriptionId: string;
            }[];
        } & {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            userId: string;
            status: import(".prisma/client").$Enums.SubStatus;
            deliveryWindow: import(".prisma/client").$Enums.DeliveryWindow;
            addressId: string | null;
            frequency: import(".prisma/client").$Enums.SubFrequency;
            preferredDay: number;
            nextBillingDate: Date;
            pausedUntil: Date | null;
            cancelledAt: Date | null;
        })[];
    }>;
    pause(id: string, userId: string): Promise<{
        items: {
            id: string;
            name: string;
            erpProductId: string;
            sku: string;
            qty: number;
            subscriptionId: string;
        }[];
    } & {
        id: string;
        createdAt: Date;
        updatedAt: Date;
        userId: string;
        status: import(".prisma/client").$Enums.SubStatus;
        deliveryWindow: import(".prisma/client").$Enums.DeliveryWindow;
        addressId: string | null;
        frequency: import(".prisma/client").$Enums.SubFrequency;
        preferredDay: number;
        nextBillingDate: Date;
        pausedUntil: Date | null;
        cancelledAt: Date | null;
    }>;
    cancel(id: string, userId: string): Promise<{
        items: {
            id: string;
            name: string;
            erpProductId: string;
            sku: string;
            qty: number;
            subscriptionId: string;
        }[];
    } & {
        id: string;
        createdAt: Date;
        updatedAt: Date;
        userId: string;
        status: import(".prisma/client").$Enums.SubStatus;
        deliveryWindow: import(".prisma/client").$Enums.DeliveryWindow;
        addressId: string | null;
        frequency: import(".prisma/client").$Enums.SubFrequency;
        preferredDay: number;
        nextBillingDate: Date;
        pausedUntil: Date | null;
        cancelledAt: Date | null;
    }>;
}
