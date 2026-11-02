import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SandboxStreamingProvider } from '../../providers/streaming/sandbox-streaming.provider';
import { RedisService } from '../redis/redis.service';
import { AuditService } from '../audit/audit.service';
import { CreateRoomDto, UpdateRoomDto } from './dto/rooms.dto';

@Injectable()
export class RoomsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly streamingProvider: SandboxStreamingProvider,
    private readonly redisService: RedisService,
    private readonly auditService: AuditService,
  ) {}

  
  async listCategories() {
    return this.prisma.roomCategory.findMany({
      orderBy: { name: 'asc' },
    });
  }

  async getFeatured() {
    const live = await this.prisma.streamRoom.findMany({
      where: { isLive: true },
      include: {
        creator: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
            creatorProfile: true,
          },
        },
        category: true,
      },
      take: 4,
      orderBy: { currentViewerCount: 'desc' },
    });
    if (live.length > 0) return live;
    return this.prisma.streamRoom.findMany({
      include: {
        creator: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
            creatorProfile: true,
          },
        },
        category: true,
      },
      take: 4,
      orderBy: { createdAt: 'desc' },
    });
  }

  async getTrending() {
    return this.getFeatured();
  }

  async listRooms(query?: { categoryId?: string; isLive?: boolean; search?: string }) {
    const isLiveFilter = query?.isLive !== undefined ? query.isLive : undefined;

    return this.prisma.streamRoom.findMany({
      where: {
        categoryId: query?.categoryId,
        isLive: isLiveFilter,
        title: query?.search ? { contains: query.search, mode: 'insensitive' } : undefined,
      },
      include: {
        creator: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
            creatorProfile: {
              select: {
                stageName: true,
                rating: true,
                followerCount: true,
              },
            },
          },
        },
        category: true,
      },
      orderBy: [{ isLive: 'desc' }, { currentViewerCount: 'desc' }],
    });
  }

  async getRoom(roomId: string, viewerId?: string) {
    const room = await this.prisma.streamRoom.findUnique({
      where: { id: roomId },
      include: {
        creator: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
            creatorProfile: true,
          },
        },
        category: true,
      },
    });

    if (!room) {
      throw new NotFoundException('Stream room not found');
    }

    // Dynamic viewer count from Redis coordination
    const liveViewers = await this.redisService.getRoomViewerCount(roomId);

    // Get signed playback access from streaming provider
    const playback = await this.streamingProvider.getPlaybackAccess({
      roomId: room.id,
      viewerId,
      isAuthorizedPrivateViewer: !room.isPrivate,
    });

    return {
      ...room,
      currentViewerCount: Math.max(room.currentViewerCount, liveViewers),
      playback,
    };
  }

  async createRoom(creatorId: string, dto: CreateRoomDto) {
    // Enforcement: Creator must be verified and approved
    const profile = await this.prisma.creatorProfile.findUnique({
      where: { userId: creatorId },
    });

    if (!profile || !profile.isApproved) {
      throw new ForbiddenException('Only approved verified creators can create a stream room');
    }

    const room = await this.prisma.streamRoom.create({
      data: {
        creatorId,
        title: dto.title,
        topic: dto.topic,
        categoryId: dto.categoryId,
        allowChat: dto.allowChat ?? true,
        allowTips: dto.allowTips ?? true,
        isLive: false,
      },
    });

    // Provision initial RTMP streaming credentials
    const credentials = await this.streamingProvider.provisionStream({
      roomId: room.id,
      creatorId,
      isPrivate: false,
    });

    await this.prisma.streamIngestCredential.create({
      data: {
        roomId: room.id,
        streamKeyHash: credentials.streamKeyHash,
        ingestServerUrl: credentials.ingestServerUrl,
        playbackUrl: credentials.playbackUrl,
        expiresAt: credentials.expiresAt,
      },
    });

    await this.auditService.log({
      actorId: creatorId,
      action: 'STREAM_ROOM_CREATED',
      entityType: 'StreamRoom',
      entityId: room.id,
      description: `Stream room created: ${room.title}`,
    });

    return {
      room,
      credentials: {
        streamKey: credentials.streamKey,
        ingestServerUrl: credentials.ingestServerUrl,
        playbackUrl: credentials.playbackUrl,
      },
    };
  }

  async updateRoom(roomId: string, creatorId: string, dto: UpdateRoomDto) {
    const room = await this.prisma.streamRoom.findUnique({ where: { id: roomId } });
    if (!room) throw new NotFoundException('Room not found');
    if (room.creatorId !== creatorId) throw new ForbiddenException('Not your room');

    return this.prisma.streamRoom.update({
      where: { id: roomId },
      data: {
        title: dto.title,
        topic: dto.topic,
        categoryId: dto.categoryId,
        allowChat: dto.allowChat,
        allowTips: dto.allowTips,
      },
    });
  }

  async goLive(roomId: string, creatorId: string) {
    const room = await this.prisma.streamRoom.findUnique({
      where: { id: roomId },
      include: {
        creator: {
          include: { creatorProfile: true },
        },
      },
    });

    if (!room) throw new NotFoundException('Room not found');
    if (room.creatorId !== creatorId) throw new ForbiddenException('Not authorized for this room');

    // CRITICAL: Unapproved creators must NEVER broadcast
    if (!room.creator.creatorProfile?.isApproved) {
      throw new ForbiddenException('Unapproved creators are not permitted to broadcast');
    }

    if (room.isLive) {
      return { success: true, message: 'Room is already live', room };
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const liveRoom = await tx.streamRoom.update({
        where: { id: roomId },
        data: { isLive: true },
      });

      await tx.creatorProfile.update({
        where: { userId: creatorId },
        data: { isLive: true },
      });

      const session = await tx.streamSession.create({
        data: {
          roomId,
          startedAt: new Date(),
        },
      });

      return { room: liveRoom, session };
    });

    await this.auditService.log({
      actorId: creatorId,
      action: 'STREAM_STARTED',
      entityType: 'StreamRoom',
      entityId: roomId,
      description: `Creator went live in room ${roomId}`,
    });

    return {
      success: true,
      message: 'Stream started successfully',
      room: updated.room,
      sessionId: updated.session.id,
    };
  }

  async endStream(roomId: string, creatorId: string) {
    const room = await this.prisma.streamRoom.findUnique({ where: { id: roomId } });
    if (!room) throw new NotFoundException('Room not found');
    if (room.creatorId !== creatorId) throw new ForbiddenException('Not your room');

    await this.prisma.$transaction(async (tx) => {
      await tx.streamRoom.update({
        where: { id: roomId },
        data: { isLive: false, currentViewerCount: 0 },
      });

      await tx.creatorProfile.update({
        where: { userId: creatorId },
        data: { isLive: false },
      });

      // Close open stream sessions
      const activeSession = await tx.streamSession.findFirst({
        where: { roomId, endedAt: null },
        orderBy: { startedAt: 'desc' },
      });

      if (activeSession) {
        await tx.streamSession.update({
          where: { id: activeSession.id },
          data: { endedAt: new Date() },
        });
      }
    });

    await this.streamingProvider.endStream(roomId);

    await this.auditService.log({
      actorId: creatorId,
      action: 'STREAM_ENDED',
      entityType: 'StreamRoom',
      entityId: roomId,
      description: `Creator ended live stream for room ${roomId}`,
    });

    return { success: true, message: 'Stream ended successfully' };
  }

  async rotateCredentials(roomId: string, creatorId: string) {
    const room = await this.prisma.streamRoom.findUnique({ where: { id: roomId } });
    if (!room) throw new NotFoundException('Room not found');
    if (room.creatorId !== creatorId) throw new ForbiddenException('Not your room');

    // Revoke old credentials
    await this.prisma.streamIngestCredential.updateMany({
      where: { roomId, isRevoked: false },
      data: { isRevoked: true },
    });

    // Provision fresh credentials
    const credentials = await this.streamingProvider.provisionStream({
      roomId,
      creatorId,
      isPrivate: room.isPrivate,
    });

    await this.prisma.streamIngestCredential.create({
      data: {
        roomId,
        streamKeyHash: credentials.streamKeyHash,
        ingestServerUrl: credentials.ingestServerUrl,
        playbackUrl: credentials.playbackUrl,
        expiresAt: credentials.expiresAt,
      },
    });

    await this.auditService.log({
      actorId: creatorId,
      action: 'STREAM_CREDENTIALS_ROTATED',
      entityType: 'StreamRoom',
      entityId: roomId,
      description: `Rotated RTMP stream key for room ${roomId}`,
    });

    return {
      streamKey: credentials.streamKey,
      ingestServerUrl: credentials.ingestServerUrl,
      playbackUrl: credentials.playbackUrl,
    };
  }
}
