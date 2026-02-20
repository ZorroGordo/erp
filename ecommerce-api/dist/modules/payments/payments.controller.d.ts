import { PaymentsService } from './payments.service';
import { type ChargeDto } from './payments.dto';
export declare class PaymentsController {
    private readonly payments;
    constructor(payments: PaymentsService);
    charge(req: any, dto: ChargeDto): Promise<{
        success: boolean;
        orderNumber: string;
        message: string;
    }>;
    webhook(req: any, signature: string, dto: any): Promise<{
        received: boolean;
    }>;
}
