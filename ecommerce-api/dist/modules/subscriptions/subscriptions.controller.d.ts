import { SubscriptionsService } from './subscriptions.service';
export declare class SubscriptionsController {
    private readonly subs;
    constructor(subs: SubscriptionsService);
    list(req: any): Promise<{
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
    pause(id: string, req: any): Promise<{
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
    cancel(id: string, req: any): Promise<{
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
