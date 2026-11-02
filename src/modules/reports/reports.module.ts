import { Module } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { ReportsController, UserBlocksController } from './reports.controller';

@Module({
  controllers: [ReportsController, UserBlocksController],
  providers: [ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}

export const ModerationModule = ReportsModule;
