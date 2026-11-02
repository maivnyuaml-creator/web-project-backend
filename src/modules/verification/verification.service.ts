import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SandboxIdentityProvider } from '../../providers/identity/sandbox-identity.provider';
import { AuditService } from '../audit/audit.service';
import { VerificationStatus } from '@prisma/client';
import { CreateVerificationSessionDto, CompleteSandboxVerificationDto } from './dto/verification.dto';

@Injectable()
export class VerificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly identityProvider: SandboxIdentityProvider,
    private readonly auditService: AuditService,
  ) {}

  async createSession(userId: string, dto: CreateVerificationSessionDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const session = await this.identityProvider.createVerificationSession({
      userId,
      userEmail: user.email,
      returnUrl: dto.returnUrl,
    });

    await this.prisma.identityVerification.create({
      data: {
        userId,
        provider: 'sandbox',
        externalSessionId: session.sessionId,
        status: VerificationStatus.PENDING,
        expiresAt: session.expiresAt,
      },
    });

    return session;
  }

  async getSessionStatus(sessionId: string) {
    const record = await this.prisma.identityVerification.findUnique({
      where: { externalSessionId: sessionId },
    });
    if (!record) throw new NotFoundException('Verification session not found');

    return record;
  }

  async completeSandboxFlow(dto: CompleteSandboxVerificationDto) {
    const record = await this.prisma.identityVerification.findUnique({
      where: { externalSessionId: dto.sessionId },
    });
    if (!record) throw new NotFoundException('Verification session not found');

    const updated = await this.prisma.identityVerification.update({
      where: { externalSessionId: dto.sessionId },
      data: {
        status: dto.approve ? VerificationStatus.VERIFIED : VerificationStatus.REJECTED,
        documentVerified: dto.approve,
        selfieMatched: dto.approve,
        rejectionReason: dto.approve ? null : 'Sandbox simulation: document rejected',
      },
    });

    // Also record adult age verification record if verified
    if (dto.approve) {
      await this.prisma.ageVerification.create({
        data: {
          userId: record.userId,
          provider: 'sandbox',
          externalReference: dto.sessionId,
          status: VerificationStatus.VERIFIED,
          verifiedAge: 21,
          expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
        },
      });
    }

    await this.auditService.log({
      actorId: record.userId,
      action: dto.approve ? 'IDENTITY_VERIFIED' : 'IDENTITY_REJECTED',
      entityType: 'IdentityVerification',
      entityId: record.id,
      description: `Identity verification session ${dto.sessionId} finished with status ${updated.status}`,
    });

    return updated;
  }
}
