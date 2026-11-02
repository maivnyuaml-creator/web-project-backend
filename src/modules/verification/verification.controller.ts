import { Controller, Post, Get, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { VerificationService } from './verification.service';
import { CreateVerificationSessionDto, CompleteSandboxVerificationDto } from './dto/verification.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('Verification')
@Controller('verification')
export class VerificationController {
  constructor(private readonly verificationService: VerificationService) {}

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post('sessions')
  @ApiOperation({ summary: 'Initiate a hosted age and identity verification session' })
  async createSession(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateVerificationSessionDto,
  ) {
    return this.verificationService.createSession(user.id, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('sessions/:id')
  @ApiOperation({ summary: 'Check status of verification session' })
  async getStatus(@Param('id') sessionId: string) {
    return this.verificationService.getSessionStatus(sessionId);
  }

  @Public()
  @Post('sandbox-flow')
  @ApiOperation({ summary: 'Simulate verification provider completion (development only)' })
  async completeSandboxFlow(@Body() dto: CompleteSandboxVerificationDto) {
    return this.verificationService.completeSandboxFlow(dto);
  }
}
