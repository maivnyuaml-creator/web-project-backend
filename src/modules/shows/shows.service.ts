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
import { SandboxStreamingProvider } from '../../providers/streaming/sandbox-streaming.provider';
import { AuditService } from '../audit/audit.service';
import { ShowStatus, ShowType, LedgerEntryType, EarningSource } from '@prisma/client';
import { RequestShowDto, EndShowDto } from './dto/shows.dto';

@Injectable()
export class ShowsService {
  private readonly logger = new Logger(ShowsService.name);
  private readonly platformFeePercent: number;
  private readonly tokenValueMinorUnits: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly walletService: WalletService,
    private readonly chatGateway: ChatGateway,
    private readonly streamingProvider: SandboxStreamingProvider,
    private readonly auditService: AuditService,
    private readonly configService: ConfigService,
  ) {
    this.platformFeePercent = this.configService.get<number>('economics.platformFeePercentage', 20);
    this.tokenValueMinorUnits = this.configService.get<number>('economics.tokenUsdValueMinorUnits', 10);
  }

  async requestShow(viewerId: string, dto: RequestShowDto) {
    const room = await this.prisma.streamRoom.findUnique({
      where: { id: dto.roomId },
      include: {
        creator: {
          include: { creatorProfile: true },
        },
      },
    });

    if (!room) throw new NotFoundException('Stream room not found');
    if (room.creatorId === viewerId) throw new BadRequestException('Cannot request show with yourself');

    const profile = room.creator.creatorProfile;
    if (!profile || !profile.isApproved) {
      throw new ForbiddenException('Creator is not approved for private shows');
    }

    const ratePerMinute =
      dto.type === ShowType.PRIVATE
        ? profile.privateShowRatePerMinute
        : profile.groupShowRatePerMinute;

    // Check viewer has at least enough for minimum 1 minute
    const wallet = await this.walletService.getWallet(viewerId);
    if (wallet.tokenBalance < ratePerMinute) {
      throw new BadRequestException(
        `Insufficient balance for show. Minimum ${ratePerMinute} tokens required for 1 minute.`,
      );
    }

    // Check creator not already in an active show
    const activeShow = await this.prisma.showSession.findFirst({
      where: {
        creatorId: room.creatorId,
        status: { in: [ShowStatus.REQUESTED, ShowStatus.ACCEPTED, ShowStatus.ACTIVE] },
      },
    });

    if (activeShow) {
      throw new BadRequestException('Creator is currently engaged in another show request');
    }

    const show = await this.prisma.showSession.create({
      data: {
        roomId: room.id,
        creatorId: room.creatorId,
        viewerId,
        type: dto.type,
        status: ShowStatus.REQUESTED,
        tokenRatePerMinute: ratePerMinute,
      },
      include: {
        viewer: { select: { id: true, username: true, displayName: true } },
      },
    });

    // Broadcast to room
    this.chatGateway.broadcastShowUpdate(room.id, 'show:requested', {
      showId: show.id,
      creatorId: room.creatorId,
      viewerName: show.viewer.displayName,
      type: show.type,
      ratePerMinute,
    });

    return show;
  }

  async acceptShow(showId: string, creatorId: string) {
    const show = await this.prisma.showSession.findUnique({ where: { id: showId } });
    if (!show) throw new NotFoundException('Show not found');
    if (show.creatorId !== creatorId) throw new ForbiddenException('Not your show');

    if (show.status !== ShowStatus.REQUESTED) {
      throw new BadRequestException(`Cannot accept show in state: ${show.status}`);
    }

    const updated = await this.prisma.showSession.update({
      where: { id: showId },
      data: {
        status: ShowStatus.ACCEPTED,
        startedAt: new Date(),
      },
    });

    this.chatGateway.broadcastShowUpdate(show.roomId, 'show:accepted', {
      showId: updated.id,
      status: updated.status,
    });

    return updated;
  }

  async joinShow(showId: string, userId: string) {
    const show = await this.prisma.showSession.findUnique({ where: { id: showId } });
    if (!show) throw new NotFoundException('Show not found');

    if (show.creatorId !== userId && show.viewerId !== userId) {
      throw new ForbiddenException('You are not an authorized participant for this private show');
    }

    if (show.status !== ShowStatus.ACCEPTED && show.status !== ShowStatus.ACTIVE) {
      throw new BadRequestException(`Show is not active (current status: ${show.status})`);
    }

    if (show.status === ShowStatus.ACCEPTED) {
      await this.prisma.showSession.update({
        where: { id: showId },
        data: { status: ShowStatus.ACTIVE },
      });
    }

    // Get authorized private playback access
    const playback = await this.streamingProvider.getPlaybackAccess({
      roomId: show.roomId,
      viewerId: userId,
      isAuthorizedPrivateViewer: true,
    });

    return {
      showId: show.id,
      status: ShowStatus.ACTIVE,
      playback,
    };
  }

  async endShow(showId: string, userId: string, dto?: EndShowDto) {
    const show = await this.prisma.showSession.findUnique({
      where: { id: showId },
    });

    if (!show) throw new NotFoundException('Show not found');
    if (show.creatorId !== userId && show.viewerId !== userId) {
      throw new ForbiddenException('Not authorized to end this show');
    }

    if (show.status === ShowStatus.ENDED || show.status === ShowStatus.CANCELLED) {
      return { success: true, message: 'Show is already terminated', show };
    }

    const endedAt = new Date();
    const startedAt = show.startedAt || show.createdAt;
    const durationSeconds = Math.max(1, Math.floor((endedAt.getTime() - startedAt.getTime()) / 1000));
    const billedMinutes = Math.max(1, Math.ceil(durationSeconds / 60));
    const totalTokensToCharge = billedMinutes * show.tokenRatePerMinute;

    const grossMinorUnits = totalTokensToCharge * this.tokenValueMinorUnits;
    const platformFeeMinorUnits = Math.round(grossMinorUnits * (this.platformFeePercent / 100));
    const netMinorUnits = grossMinorUnits - platformFeeMinorUnits;

    // Transactionally debit tokens from viewer and record creator earning
    const updated = await this.prisma.$transaction(async (tx) => {
      // Debit viewer
      await this.walletService.debitTokens(
        {
          userId: show.viewerId,
          amount: totalTokensToCharge,
          type: LedgerEntryType.SHOW_DEBIT,
          referenceType: 'ShowSession',
          referenceId: show.id,
          idempotencyKey: `debit_show_${show.id}`,
          metadata: {
            billedMinutes,
            ratePerMinute: show.tokenRatePerMinute,
          },
        },
        tx,
      );

      // Record creator earning
      await tx.creatorEarning.create({
        data: {
          creatorId: show.creatorId,
          source: EarningSource.SHOW,
          referenceId: show.id,
          tokenAmount: totalTokensToCharge,
          grossEarningMinorUnits: grossMinorUnits,
          netEarningMinorUnits: netMinorUnits,
          platformFeeMinorUnits,
          currency: 'USD',
        },
      });

      // Update show session status
      const endedShow = await tx.showSession.update({
        where: { id: show.id },
        data: {
          status: ShowStatus.ENDED,
          endedAt,
          totalTokensCharged: totalTokensToCharge,
        },
      });

      return endedShow;
    });

    this.chatGateway.broadcastShowUpdate(show.roomId, 'show:ended', {
      showId: updated.id,
      billedMinutes,
      totalTokensCharged: totalTokensToCharge,
    });

    await this.auditService.log({
      actorId: userId,
      action: 'SHOW_SESSION_ENDED',
      entityType: 'ShowSession',
      entityId: show.id,
      description: `Show ended. Billed ${billedMinutes} mins (${totalTokensToCharge} tokens)`,
    });

    return {
      success: true,
      show: updated,
      billedMinutes,
      tokensCharged: totalTokensToCharge,
    };
  }
}
