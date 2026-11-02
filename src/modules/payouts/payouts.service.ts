import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EarningsService } from '../earnings/earnings.service';
import { AuditService } from '../audit/audit.service';
import { PayoutStatus, Role } from '@prisma/client';
import { RequestPayoutDto, AddPayoutAccountDto } from './dto/payouts.dto';

@Injectable()
export class PayoutsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly earningsService: EarningsService,
    private readonly auditService: AuditService,
  ) {}

  async getCreatorPayouts(creatorId: string) {
    return this.prisma.payout.findMany({
      where: { creatorId },
      include: {
        payoutAccount: true,
      },
      orderBy: { requestedAt: 'desc' },
    });
  }

  async requestPayout(creatorId: string, dto: RequestPayoutDto) {
    // 1. Verify creator profile is approved
    const profile = await this.prisma.creatorProfile.findUnique({
      where: { userId: creatorId },
    });

    if (!profile || !profile.isApproved) {
      throw new ForbiddenException('Only approved verified creators can request payouts');
    }

    // 2. Check available earnings
    const earnings = await this.earningsService.getCreatorEarnings(creatorId);
    if (earnings.summary.availableForPayoutMinorUnits < dto.amountMinorUnits) {
      throw new BadRequestException(
        `Insufficient available earnings. Available: ${earnings.summary.availableForPayoutMinorUnits / 100} USD, Requested: ${dto.amountMinorUnits / 100} USD`,
      );
    }

    // 3. Find or validate payout account
    let payoutAccountId = dto.payoutAccountId;
    if (!payoutAccountId) {
      const defaultAccount = await this.prisma.creatorPayoutAccount.findFirst({
        where: { userId: creatorId, isDefault: true },
      });
      if (!defaultAccount) {
        throw new BadRequestException('No default payout account configured. Please add a payout account first.');
      }
      payoutAccountId = defaultAccount.id;
    }

    const payout = await this.prisma.payout.create({
      data: {
        creatorId,
        payoutAccountId,
        amountMinorUnits: dto.amountMinorUnits,
        status: PayoutStatus.REQUESTED,
        notes: dto.notes,
      },
      include: {
        payoutAccount: true,
      },
    });

    await this.auditService.log({
      actorId: creatorId,
      action: 'PAYOUT_REQUESTED',
      entityType: 'Payout',
      entityId: payout.id,
      description: `Creator requested payout of ${dto.amountMinorUnits / 100} USD`,
    });

    return payout;
  }

  async addPayoutAccount(creatorId: string, dto: AddPayoutAccountDto) {
    return this.prisma.creatorPayoutAccount.create({
      data: {
        userId: creatorId,
        payoutMethod: dto.payoutMethod,
        accountReference: dto.accountReference,
        currency: dto.currency || 'USD',
        isDefault: true,
        isVerified: true,
      },
    });
  }

  // Admin Actions
  async listAllPayouts(status?: PayoutStatus) {
    return this.prisma.payout.findMany({
      where: status ? { status } : undefined,
      include: {
        creator: {
          select: {
            id: true,
            email: true,
            username: true,
            displayName: true,
            creatorProfile: true,
          },
        },
        payoutAccount: true,
      },
      orderBy: { requestedAt: 'desc' },
    });
  }

  async approvePayout(payoutId: string, adminId: string, notes?: string) {
    const payout = await this.prisma.payout.findUnique({
      where: { id: payoutId },
    });

    if (!payout) throw new NotFoundException('Payout not found');
    if (payout.status !== PayoutStatus.REQUESTED && payout.status !== PayoutStatus.PROCESSING) {
      throw new BadRequestException(`Cannot approve payout in status: ${payout.status}`);
    }

    const updated = await this.prisma.payout.update({
      where: { id: payoutId },
      data: {
        status: PayoutStatus.APPROVED,
        reviewerId: adminId,
        reviewedAt: new Date(),
        notes: notes || payout.notes,
      },
    });

    await this.auditService.log({
      actorId: adminId,
      action: 'PAYOUT_APPROVED',
      entityType: 'Payout',
      entityId: payoutId,
      description: `Admin approved payout of ${payout.amountMinorUnits / 100} USD for creator ${payout.creatorId}`,
    });

    return updated;
  }
}
