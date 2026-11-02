import { Controller, Post, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ReportsService } from './reports.service';
import { CreateReportDto } from './dto/reports.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Reports & Safety')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Post()
  @ApiOperation({ summary: 'Submit safety or community guidelines report' })
  async createReport(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateReportDto,
  ) {
    return this.reportsService.createReport(user.id, dto);
  }
}

@ApiTags('Users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UserBlocksController {
  constructor(private readonly reportsService: ReportsService) {}

  @Post(':id/block')
  @ApiOperation({ summary: 'Block a user from interacting with you or your room' })
  async blockUser(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') blockedId: string,
  ) {
    return this.reportsService.blockUser(user.id, blockedId);
  }

  @Delete(':id/block')
  @ApiOperation({ summary: 'Unblock a previously blocked user' })
  async unblockUser(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') blockedId: string,
  ) {
    return this.reportsService.unblockUser(user.id, blockedId);
  }
}
