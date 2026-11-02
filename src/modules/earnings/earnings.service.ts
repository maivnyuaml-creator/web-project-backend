import { Injectable, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PayoutStatus } from '@prisma/client';

@Injectable()
export class EarningsService {
  constructor(private readonly prisma: PrismaService) {}

  async getCreatorEarnings(creatorId: string) {
    const profile = await this.prisma.creatorProfile.findUnique({
      where: { userId: creatorId },
    });

    if (!profile || !profile.isApproved) {
      throw new ForbiddenException('Only approved creators can view earnings');
    }

    const earnings = await this.prisma.creatorEarning.findMany({
      where: { creatorId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    // Compute totals
    const totals = await this.prisma.creatorEarning.aggregate({
      where: { creatorId },
      _sum: {
        grossEarningMinorUnits: true,
        netEarningMinorUnits: true,
        platformFeeMinorUnits: true,
        tokenAmount: true,
      },
    });

    // Compute total payouts requested/processed/paid
    const payoutsTotal = await this.prisma.payout.aggregate({
      where: {
        creatorId,
        status: { in: [PayoutStatus.REQUESTED, PayoutStatus.PROCESSING, PayoutStatus.APPROVED, PayoutStatus.PAID] },
      },
      _sum: {
        amountMinorUnits: true,
      },
    });

    const netEarned = totals._sum.netEarningMinorUnits || 0;
    const paidOut = payoutsTotal._sum.amountMinorUnits || 0;
    const availableForPayout = Math.max(0, netEarned - paidOut);

    return {
      summary: {
        totalTokensEarned: totals._sum.tokenAmount || 0,
        grossEarningsMinorUnits: totals._sum.grossEarningMinorUnits || 0,
        platformFeesMinorUnits: totals._sum.platformFeeMinorUnits || 0,
        netEarningsMinorUnits: netEarned,
        totalPaidOutMinorUnits: paidOut,
        availableForPayoutMinorUnits: availableForPayout,
        currency: 'USD',
      },
      recentEarnings: earnings,
    };
  }
}
