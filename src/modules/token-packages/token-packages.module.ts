import { Module } from '@nestjs/common';
import { TokenPackagesService } from './token-packages.service';
import { TokenPackagesController } from './token-packages.controller';

@Module({
  controllers: [TokenPackagesController],
  providers: [TokenPackagesService],
  exports: [TokenPackagesService],
})
export class TokenPackagesModule {}
