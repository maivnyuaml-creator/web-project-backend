import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ChatGateway } from '../chat/chat.gateway';
import { SandboxStreamingProvider } from '../../providers/streaming/sandbox-streaming.provider';
import { ReportStatus, ModerationActionType } from '@prisma/client';
import { CreateReportDto, TakeModerationActionDto } from './dto/reports.dto';

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly chatGateway: ChatGateway,
    private readonly streamingProvider: SandboxStreamingProvider,
  ) {}

  async createReport(reporterId: string, dto: CreateReportDto) {
    const report = await this.prisma.report.create({
      data: {
        reporterId,
        targetType: dto.targetType,
        targetId: dto.targetId,
        reason: dto.reason,
        description: dto.description,
        status: ReportStatus.PENDING,
      },
    });

    await this.auditService.log({
      actorId: reporterId,
      action: 'REPORT_SUBMITTED',
      entityType: 'Report',
      entityId: report.id,
      description: `Report submitted against ${dto.targetType}:${dto.targetId} for ${dto.reason}`,
    });

    return report;
  }

  async blockUser(blockerId: string, blockedId: string, reason?: string) {
    if (blockerId === blockedId) {
      throw new BadRequestException('Cannot block yourself');
    }

    const block = await this.prisma.block.upsert({
      where: { blockerId_blockedId: { blockerId, blockedId } },
      update: { reason },
      create: { blockerId, blockedId, reason },
    });

    return block;
  }

  async unblockUser(blockerId: string, blockedId: string) {
    await this.prisma.block.deleteMany({
      where: { blockerId, blockedId },
    });
    return { success: true, message: 'User unblocked' };
  }

  async listReports(status?: ReportStatus) {
    return this.prisma.report.findMany({
      where: status ? { status } : undefined,
      include: {
        reporter: {
          select: { id: true, username: true, email: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async takeModerationAction(reportId: string, moderatorId: string, dto: TakeModerationActionDto) {
    const report = await this.prisma.report.findUnique({ where: { id: reportId } });
    if (!report) throw new NotFoundException('Report not found');

    const durationMinutes = dto.durationMinutes || 60;
    const expiresAt =
      dto.actionType === ModerationActionType.MUTE_CHAT || dto.actionType === ModerationActionType.BAN_TEMPORARY
        ? new Date(Date.now() + durationMinutes * 60 * 1000)
        : null;

    // 1. Record moderation action
    const action = await this.prisma.moderationAction.create({
      data: {
        moderatorId,
        targetUserId: dto.targetUserId,
        actionType: dto.actionType,
        reason: dto.reason,
        durationMinutes,
        expiresAt,
      },
    });

    // 2. Enforce action
    if (
      dto.actionType === ModerationActionType.BAN_PERMANENT ||
      dto.actionType === ModerationActionType.BAN_TEMPORARY
    ) {
      await this.prisma.$transaction([
        this.prisma.user.update({
          where: { id: dto.targetUserId },
          data: {
            isBanned: true,
            bannedReason: `Banned by moderation: ${dto.reason}`,
          },
        }),
        this.prisma.userSession.updateMany({
          where: { userId: dto.targetUserId },
          data: { isRevoked: true },
        }),
      ]);
    } else if (dto.actionType === ModerationActionType.TERMINATE_STREAM) {
      // Find active room for user
      const room = await this.prisma.streamRoom.findFirst({
        where: { creatorId: dto.targetUserId, isLive: true },
      });
      if (room) {
        await this.prisma.streamRoom.update({
          where: { id: room.id },
          data: { isLive: false },
        });
        await this.streamingProvider.endStream(room.id);
        this.chatGateway.broadcastModerationNotice(room.id, {
          type: 'STREAM_TERMINATED',
          reason: dto.reason,
        });
      }
    }

    // 3. Mark report resolved
    await this.prisma.report.update({
      where: { id: reportId },
      data: {
        status: ReportStatus.RESOLVED,
        assignedToAdminId: moderatorId,
        resolutionNotes: dto.resolutionNotes || `Action taken: ${dto.actionType}`,
      },
    });

    await this.auditService.log({
      actorId: moderatorId,
      action: `MODERATION_${dto.actionType}`,
      entityType: 'User',
      entityId: dto.targetUserId,
      description: `Moderation action ${dto.actionType} on user ${dto.targetUserId}. Reason: ${dto.reason}`,
    });

    return {
      success: true,
      action,
      reportStatus: ReportStatus.RESOLVED,
    };
  }
}
