import { Module } from '@nestjs/common';
import { CreatorApplicationsService } from './creator-applications.service';
import { CreatorApplicationsController } from './creator-applications.controller';

@Module({
  controllers: [CreatorApplicationsController],
  providers: [CreatorApplicationsService],
  exports: [CreatorApplicationsService],
})
export class CreatorApplicationsModule {}
