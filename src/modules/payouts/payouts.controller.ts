import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PayoutsService } from './payouts.service';
import { RequestPayoutDto, AddPayoutAccountDto } from './dto/payouts.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';

@ApiTags('Creator Payouts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.VERIFIED_CREATOR)
@Controller('creator')
export class PayoutsController {
  constructor(private readonly payoutsService: PayoutsService) {}

  @Get('payouts')
  @ApiOperation({ summary: 'Get creator historical payout requests and statuses (Verified Creator only)' })
  async getPayouts(@CurrentUser() user: AuthenticatedUser) {
    return this.payoutsService.getCreatorPayouts(user.id);
  }

  @Post('payout-requests')
  @ApiOperation({ summary: 'Submit a new withdrawal payout request (Verified Creator only)' })
  async requestPayout(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RequestPayoutDto,
  ) {
    return this.payoutsService.requestPayout(user.id, dto);
  }

  @Post('payout-accounts')
  @ApiOperation({ summary: 'Register a payout bank wire or wallet account' })
  async addPayoutAccount(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: AddPayoutAccountDto,
  ) {
    return this.payoutsService.addPayoutAccount(user.id, dto);
  }
}
