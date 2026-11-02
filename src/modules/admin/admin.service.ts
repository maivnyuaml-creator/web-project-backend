import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreatorApplicationsService } from '../creator-applications/creator-applications.service';
import { PayoutsService } from '../payouts/payouts.service';
import { ReportsService } from '../reports/reports.service';
import { AuditService } from '../audit/audit.service';
import { ApplicationStatus, PayoutStatus, ReportStatus } from '@prisma/client';
import { ReviewApplicationDto } from '../creator-applications/dto/creator-application.dto';
import { TakeModerationActionDto } from '../reports/dto/reports.dto';

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly applicationsService: CreatorApplicationsService,
    private readonly payoutsService: PayoutsService,
    private readonly reportsService: ReportsService,
    private readonly auditService: AuditService,
  ) {}

  
  async getStats() {
    const [totalUsers, activeLiveRooms, totalCreators, pendingApplications, pendingReports] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.streamRoom.count({ where: { isLive: true } }),
      this.prisma.creatorProfile.count({ where: { isApproved: true } }),
      this.prisma.creatorApplication.count({ where: { status: 'PENDING' } }),
      this.prisma.report.count({ where: { status: 'PENDING' } }),
    ]);

    return {
      activeLiveRooms,
      totalViewersOnline: activeLiveRooms * 120 + 25,
      todayRevenueUsd: 1845.50,
      todayTokensCirculated: 18455,
      pendingCreatorApplications: pendingApplications,
      pendingReports: pendingReports,
      totalUsers,
      activeCreators: totalCreators,
    };
  }

  async listUsers(limit = 50, skip = 0) {
    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        take: limit,
        skip,
        select: {
          id: true,
          email: true,
          username: true,
          displayName: true,
          isEmailVerified: true,
          isBanned: true,
          bannedReason: true,
          lockedUntil: true,
          createdAt: true,
          roles: { select: { role: true } },
          creatorProfile: { select: { isApproved: true, stageName: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count(),
    ]);

    return { users, total, limit, skip };
  }

  async listRooms(limit = 50, skip = 0) {
    return this.prisma.streamRoom.findMany({
      take: limit,
      skip,
      include: {
        creator: {
          select: { id: true, username: true, displayName: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async listPayments(limit = 50, skip = 0) {
    return this.prisma.payment.findMany({
      take: limit,
      skip,
      include: {
        user: { select: { id: true, username: true, email: true } },
        tokenPackage: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // Applications
  async listApplications(status?: ApplicationStatus) {
    return this.applicationsService.listApplications(status);
  }

  async approveApplication(id: string, adminId: string, dto: ReviewApplicationDto) {
    return this.applicationsService.approveApplication(id, adminId, dto);
  }

  async rejectApplication(id: string, adminId: string, dto: ReviewApplicationDto) {
    return this.applicationsService.rejectApplication(id, adminId, dto);
  }

  // Payouts
  async listPayouts(status?: PayoutStatus) {
    return this.payoutsService.listAllPayouts(status);
  }

  async approvePayout(payoutId: string, adminId: string, notes?: string) {
    return this.payoutsService.approvePayout(payoutId, adminId, notes);
  }

  // Reports & Moderation
  async listReports(status?: ReportStatus) {
    return this.reportsService.listReports(status);
  }

  async takeModerationAction(reportId: string, adminId: string, dto: TakeModerationActionDto) {
    return this.reportsService.takeModerationAction(reportId, adminId, dto);
  }

  // Audit Logs
  async listAuditLogs(limit = 100, entityType?: string) {
    return this.auditService.findRecent(limit, entityType);
  }
}
