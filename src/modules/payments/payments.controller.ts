import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  Headers,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import type { Request } from 'express';
import { PaymentsService } from './payments.service';
import { CreateCheckoutDto, SandboxCheckoutCompleteDto } from './dto/payments.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('Payments')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post('checkout')
  @ApiOperation({ summary: 'Initiate token package purchase checkout session' })
  async createCheckout(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCheckoutDto,
  ) {
    return this.paymentsService.createCheckout(user.id, dto);
  }

  @Public()
  @Post('sandbox-checkout')
  @ApiOperation({ summary: 'Simulate checkout completion in development sandbox' })
  async completeSandboxCheckout(@Body() dto: SandboxCheckoutCompleteDto) {
    return this.paymentsService.completeSandboxPayment(dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('history')
  @ApiOperation({ summary: 'Get current user payment history' })
  async getHistory(@CurrentUser() user: AuthenticatedUser) {
    return this.paymentsService.getHistory(user.id);
  }
}

@ApiTags('Webhooks')
@Controller('webhooks/payments')
export class PaymentWebhooksController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Public()
  @Post(':provider')
  @ApiOperation({ summary: 'Process incoming signed payment gateway webhook' })
  async handleWebhook(
    @Param('provider') provider: string,
    @Headers() headers: Record<string, any>,
    @Req() req: Request,
    @Body() body: any,
  ) {
    const rawBody = (req as any).rawBody || JSON.stringify(body);
    return this.paymentsService.handleWebhook(provider, headers, rawBody, body);
  }
}
