import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface RecordAuditParams {
  actorId?: string;
  actorIp?: string;
  action: string;
  entityType: string;
  entityId?: string;
  oldValue?: any;
  newValue?: any;
  description?: string;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async log(params: RecordAuditParams) {
    try {
      return await this.prisma.auditLog.create({
        data: {
          actorId: params.actorId,
          actorIp: params.actorIp,
          action: params.action,
          entityType: params.entityType,
          entityId: params.entityId,
          oldValue: params.oldValue,
          newValue: params.newValue,
          description: params.description,
        },
      });
    } catch (error: any) {
      this.logger.error(`Failed to record audit log: ${error.message}`, error.stack);
    }
  }

  async findRecent(limit = 100, entityType?: string) {
    return this.prisma.auditLog.findMany({
      where: entityType ? { entityType } : undefined,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        actor: {
          select: {
            id: true,
            username: true,
            email: true,
          },
        },
      },
    });
  }
}
