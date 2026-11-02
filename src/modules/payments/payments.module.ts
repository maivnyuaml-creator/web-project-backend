import { Module } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { PaymentsController, PaymentWebhooksController } from './payments.controller';

@Module({
  controllers: [PaymentsController, PaymentWebhooksController],
  providers: [PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
