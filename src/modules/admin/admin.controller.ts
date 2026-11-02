import { Public } from '../../common/decorators/public.decorator';
import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { Role, ApplicationStatus, PayoutStatus, ReportStatus } from '@prisma/client';
import { ReviewApplicationDto } from '../creator-applications/dto/creator-application.dto';
import { TakeModerationActionDto } from '../reports/dto/reports.dto';

@ApiTags('Admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMINISTRATOR)
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  
  @Public()
  @Get('stats')
  @ApiOperation({ summary: 'Retrieve platform metrics overview' })
  async getStats() {
    return this.adminService.getStats();
  }

  @Get('users')
  @ApiOperation({ summary: 'List platform users with roles and status (Admin only)' })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'skip', required: false })
  async listUsers(
    @Query('limit') limit?: string,
    @Query('skip') skip?: string,
  ) {
    const l = limit ? parseInt(limit, 10) : 50;
    const s = skip ? parseInt(skip, 10) : 0;
    return this.adminService.listUsers(l, s);
  }

  @Get('rooms')
  @ApiOperation({ summary: 'List all platform stream rooms (Admin only)' })
  async listRooms(
    @Query('limit') limit?: string,
    @Query('skip') skip?: string,
  ) {
    const l = limit ? parseInt(limit, 10) : 50;
    const s = skip ? parseInt(skip, 10) : 0;
    return this.adminService.listRooms(l, s);
  }

  @Get('payments')
  @ApiOperation({ summary: 'List all payment transactions (Admin only)' })
  async listPayments(
    @Query('limit') limit?: string,
    @Query('skip') skip?: string,
  ) {
    const l = limit ? parseInt(limit, 10) : 50;
    const s = skip ? parseInt(skip, 10) : 0;
    return this.adminService.listPayments(l, s);
  }

  // Applications
  @Get('applications')
  @ApiOperation({ summary: 'List creator verification applications (Admin only)' })
  @ApiQuery({ name: 'status', enum: ApplicationStatus, required: false })
  async listApplications(@Query('status') status?: ApplicationStatus) {
    return this.adminService.listApplications(status);
  }

  @Post('applications/:id/approve')
  @ApiOperation({ summary: 'Approve creator application and grant streaming rights (Admin only)' })
  async approveApplication(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ReviewApplicationDto,
  ) {
    return this.adminService.approveApplication(id, admin.id, dto);
  }

  @Post('applications/:id/reject')
  @ApiOperation({ summary: 'Reject creator application with notes (Admin only)' })
  async rejectApplication(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ReviewApplicationDto,
  ) {
    return this.adminService.rejectApplication(id, admin.id, dto);
  }

  // Payouts
  @Get('payouts')
  @ApiOperation({ summary: 'List creator withdrawal payout requests (Admin only)' })
  @ApiQuery({ name: 'status', enum: PayoutStatus, required: false })
  async listPayouts(@Query('status') status?: PayoutStatus) {
    return this.adminService.listPayouts(status);
  }

  @Post('payouts/:id/approve')
  @ApiOperation({ summary: 'Approve and mark payout as processed (Admin only)' })
  async approvePayout(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('id') id: string,
    @Body('notes') notes?: string,
  ) {
    return this.adminService.approvePayout(id, admin.id, notes);
  }

  // Reports
  @Get('reports')
  @ApiOperation({ summary: 'List submitted reports for moderation review (Admin/Mod only)' })
  @ApiQuery({ name: 'status', enum: ReportStatus, required: false })
  async listReports(@Query('status') status?: ReportStatus) {
    return this.adminService.listReports(status);
  }

  @Post('reports/:id/actions')
  @ApiOperation({ summary: 'Enforce moderation action on reported entity/user (Admin/Mod only)' })
  async takeAction(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: TakeModerationActionDto,
  ) {
    return this.adminService.takeModerationAction(id, admin.id, dto);
  }

  // Audit Logs
  @Get('audit-logs')
  @ApiOperation({ summary: 'Retrieve platform audit logs (Admin only)' })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'entityType', required: false })
  async listAuditLogs(
    @Query('limit') limit?: string,
    @Query('entityType') entityType?: string,
  ) {
    const l = limit ? parseInt(limit, 10) : 100;
    return this.adminService.listAuditLogs(l, entityType);
  }
}
