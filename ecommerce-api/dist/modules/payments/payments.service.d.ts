import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';
import { CartService } from '../cart/cart.service';
import type { Queue } from 'bullmq';
import type { Env } from '../../config/configuration';
import type { ChargeDto } from './payments.dto';
export declare class PaymentsService {
    private readonly prisma;
    private readonly cart;
    private readonly config;
    private readonly emailQueue;
    private readonly invoiceQueue;
    private readonly logger;
    constructor(prisma: PrismaService, cart: CartService, config: ConfigService<Env>, emailQueue: Queue, invoiceQueue: Queue);
    chargeOrder(dto: ChargeDto, userId?: string): Promise<{
        success: boolean;
        orderNumber: string;
        message: string;
    }>;
    handleWebhook(rawBody: Buffer, signature: string, payload: any): Promise<{
        received: boolean;
    }>;
    private handleChargeSucceeded;
    private handleChargeFailed;
    private handleChargeRefunded;
}
