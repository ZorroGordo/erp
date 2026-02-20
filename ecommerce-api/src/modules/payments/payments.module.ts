import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { CartModule } from '../cart/cart.module';
import { QUEUES } from '../../queue/queues';

@Module({
  imports: [
    CartModule,
    BullModule.registerQueue(
      { name: QUEUES.EMAIL },
      { name: QUEUES.INVOICE },
    ),
  ],
  controllers: [PaymentsController],
  providers:   [PaymentsService],
  exports:     [PaymentsService],
})
export class PaymentsModule {}
