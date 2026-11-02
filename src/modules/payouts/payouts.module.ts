import { Module } from '@nestjs/common';
import { PayoutsService } from './payouts.service';
import { PayoutsController } from './payouts.controller';
import { EarningsService } from '../earnings/earnings.service';

@Module({
  controllers: [PayoutsController],
  providers: [PayoutsService, EarningsService],
  exports: [PayoutsService],
})
export class PayoutsModule {}
