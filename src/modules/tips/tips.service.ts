import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { WalletService } from '../wallet/wallet.service';
import { ChatGateway } from '../chat/chat.gateway';
import { AuditService } from '../audit/audit.service';
import { LedgerEntryType, EarningSource } from '@prisma/client';
import { SendTipDto } from './dto/tips.dto';

@Injectable()
export class TipsService {
  private readonly logger = new Logger(TipsService.name);
  private readonly platformFeePercent: number;
  private readonly tokenValueMinorUnits: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly walletService: WalletService,
    private readonly chatGateway: ChatGateway,
    private readonly auditService: AuditService,
    private readonly configService: ConfigService,
  ) {
    this.platformFeePercent = this.configService.get<number>('economics.platformFeePercentage', 20);
    this.tokenValueMinorUnits = this.configService.get<number>('economics.tokenUsdValueMinorUnits', 10);
  }

  async sendTip(senderId: string, dto: SendTipDto) {
    // 1. Verify room exists and accepts tips
    const room = await this.prisma.streamRoom.findUnique({
      where: { id: dto.roomId },
      include: { creator: true },
    });

    if (!room) {
      throw new NotFoundException('Stream room not found');
    }

    if (!room.allowTips) {
      throw new ForbiddenException('Tips are disabled in this room');
    }

    if (room.creatorId === senderId) {
      throw new BadRequestException('Creators cannot send tips to their own room');
    }

    // 2. Obtain authoritative token price from database
    let tokenAmount = 0;
    let label = 'Custom Tip';

    if (dto.tipMenuItemId) {
      const menuItem = await this.prisma.tipMenuItem.findUnique({
        where: { id: dto.tipMenuItemId, isActive: true },
      });

      if (!menuItem) {
        throw new NotFoundException('Selected tip menu item not found or inactive');
      }

      tokenAmount = menuItem.tokenPrice;
      label = menuItem.label;
    } else if (dto.customTokenAmount && dto.customTokenAmount > 0) {
      tokenAmount = dto.customTokenAmount;
    } else {
      throw new BadRequestException('Either tipMenuItemId or customTokenAmount must be specified');
    }

    // 3. Deduplication check
    const existingTip = await this.prisma.tip.findUnique({
      where: { idempotencyKey: dto.idempotencyKey },
    });
    if (existingTip) {
      return { success: true, duplicate: true, tip: existingTip };
    }

    // 4. Calculate economics (integer minor units)
    const grossEarningMinorUnits = tokenAmount * this.tokenValueMinorUnits;
    const platformFeeMinorUnits = Math.round(
      grossEarningMinorUnits * (this.platformFeePercent / 100),
    );
    const netEarningMinorUnits = grossEarningMinorUnits - platformFeeMinorUnits;

    // 5. Atomic transaction: Debit viewer wallet, record tip, record creator earning
    const result = await this.prisma.$transaction(async (tx) => {
      // Debit viewer tokens atomically
      await this.walletService.debitTokens(
        {
          userId: senderId,
          amount: tokenAmount,
          type: LedgerEntryType.TIP_DEBIT,
          referenceType: 'Tip',
          referenceId: dto.roomId,
          idempotencyKey: `debit_tip_${dto.idempotencyKey}`,
          metadata: {
            roomId: dto.roomId,
            creatorId: room.creatorId,
            menuItem: label,
          },
        },
        tx,
      );

      // Create Tip record
      const tip = await tx.tip.create({
        data: {
          senderId,
          receiverId: room.creatorId,
          roomId: room.id,
          tipMenuItemId: dto.tipMenuItemId,
          tokenAmount,
          creatorEarningMinorUnits: netEarningMinorUnits,
          platformFeeMinorUnits,
          message: dto.message,
          isAnonymous: dto.isAnonymous ?? false,
          idempotencyKey: dto.idempotencyKey,
        },
        include: {
          sender: {
            select: {
              id: true,
              username: true,
              displayName: true,
              avatarUrl: true,
            },
          },
        },
      });

      // Record creator earning
      await tx.creatorEarning.create({
        data: {
          creatorId: room.creatorId,
          source: EarningSource.TIP,
          referenceId: tip.id,
          tokenAmount,
          grossEarningMinorUnits,
          netEarningMinorUnits,
          platformFeeMinorUnits,
          currency: 'USD',
        },
      });

      // Update room session total tips if live
      await tx.streamSession.updateMany({
        where: { roomId: room.id, endedAt: null },
        data: {
          totalTipsEarned: { increment: tokenAmount },
        },
      });

      // Notify creator
      await tx.notification.create({
        data: {
          userId: room.creatorId,
          type: 'TIP_RECEIVED',
          title: `Tip Received: ${tokenAmount} Tokens! 🎁`,
          body: `${dto.isAnonymous ? 'Someone' : tip.sender.displayName} tipped ${tokenAmount} tokens: "${label}"`,
        },
      });

      return tip;
    });

    // 6. Broadcast real-time tip event ONLY after successful transaction commit
    this.chatGateway.broadcastTip(dto.roomId, {
      tipId: result.id,
      roomId: dto.roomId,
      sender: dto.isAnonymous
        ? { displayName: 'Anonymous Fan' }
        : result.sender,
      tokenAmount,
      label,
      message: dto.message,
      createdAt: result.createdAt,
    });

    await this.auditService.log({
      actorId: senderId,
      action: 'TIP_SENT',
      entityType: 'Tip',
      entityId: result.id,
      description: `User sent ${tokenAmount} tokens tip to room ${dto.roomId}`,
    });

    return {
      success: true,
      tip: result,
    };
  }

  async getRecentRoomTips(roomId: string, limit = 20) {
    return this.prisma.tip.findMany({
      where: { roomId },
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        sender: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
          },
        },
        tipMenuItem: true,
      },
    });
  }
}
