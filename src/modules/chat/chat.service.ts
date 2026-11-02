import { Injectable, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class ChatService {
  private readonly prohibitedWords = ['underage', 'minor', 'exploit', 'trafficking'];

  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
  ) {}

  async getRecentMessages(roomId: string, limit = 50) {
    return this.prisma.chatMessage.findMany({
      where: { roomId, isDeleted: false },
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
            roles: { select: { role: true } },
          },
        },
      },
    });
  }

  async saveMessage(roomId: string, userId: string, content: string) {
    if (!content || content.trim().length === 0) {
      throw new BadRequestException('Message cannot be empty');
    }

    if (content.length > 300) {
      throw new BadRequestException('Message length cannot exceed 300 characters');
    }

    // Filter check
    const lowerContent = content.toLowerCase();
    for (const word of this.prohibitedWords) {
      if (lowerContent.includes(word)) {
        throw new ForbiddenException('Message violates community standards and prohibited content policies');
      }
    }

    // Check room allows chat
    const room = await this.prisma.streamRoom.findUnique({ where: { id: roomId } });
    if (!room || !room.allowChat) {
      throw new ForbiddenException('Chat is currently disabled in this room');
    }

    // Check if user is blocked by creator
    const isBlocked = await this.prisma.block.findFirst({
      where: { blockerId: room.creatorId, blockedId: userId },
    });
    if (isBlocked) {
      throw new ForbiddenException('You have been blocked from interacting in this room');
    }

    // Check for active mute
    const activeMute = await this.prisma.moderationAction.findFirst({
      where: {
        targetUserId: userId,
        actionType: 'MUTE_CHAT',
        expiresAt: { gt: new Date() },
      },
    });
    if (activeMute) {
      throw new ForbiddenException('You are temporarily muted from chat');
    }

    const message = await this.prisma.chatMessage.create({
      data: {
        roomId,
        userId,
        content: content.trim(),
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
            roles: { select: { role: true } },
          },
        },
      },
    });

    return message;
  }

  async deleteMessage(messageId: string, moderatorId: string) {
    const message = await this.prisma.chatMessage.findUnique({ where: { id: messageId } });
    if (!message) return null;

    return this.prisma.chatMessage.update({
      where: { id: messageId },
      data: {
        isDeleted: true,
        deletedByUserId: moderatorId,
      },
    });
  }
}
