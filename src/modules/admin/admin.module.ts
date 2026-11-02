import { Module } from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { CreatorApplicationsModule } from '../creator-applications/creator-applications.module';
import { PayoutsModule } from '../payouts/payouts.module';
import { ReportsModule } from '../reports/reports.module';

@Module({
  imports: [CreatorApplicationsModule, PayoutsModule, ReportsModule],
  controllers: [AdminController],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}
