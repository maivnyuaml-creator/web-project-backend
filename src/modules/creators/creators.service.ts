import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateCreatorProfileDto, CreateTipMenuItemDto } from './dto/creators.dto';

@Injectable()
export class CreatorsService {
  constructor(private readonly prisma: PrismaService) {}

  async getCreator(creatorIdOrUserId: string) {
    const profile = await this.prisma.creatorProfile.findFirst({
      where: {
        OR: [{ id: creatorIdOrUserId }, { userId: creatorIdOrUserId }],
        isApproved: true,
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
            createdAt: true,
          },
        },
        tipMenuItems: {
          where: { isActive: true },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    if (!profile) {
      throw new NotFoundException('Verified creator profile not found');
    }

    // Fetch active stream room if live
    const room = await this.prisma.streamRoom.findFirst({
      where: { creatorId: profile.userId },
      select: {
        id: true,
        title: true,
        topic: true,
        isLive: true,
        isPrivate: true,
        currentViewerCount: true,
      },
    });

    return {
      ...profile,
      currentRoom: room,
    };
  }

  async updateMyProfile(userId: string, dto: UpdateCreatorProfileDto) {
    const profile = await this.prisma.creatorProfile.findUnique({
      where: { userId },
    });

    if (!profile) {
      throw new NotFoundException('Creator profile not found');
    }

    if (!profile.isApproved) {
      throw new ForbiddenException('Creator application is not yet approved');
    }

    const updated = await this.prisma.creatorProfile.update({
      where: { userId },
      data: {
        stageName: dto.stageName,
        bio: dto.bio,
        bannerUrl: dto.bannerUrl,
        tipMenuEnabled: dto.tipMenuEnabled,
        privateShowRatePerMinute: dto.privateShowRatePerMinute,
        groupShowRatePerMinute: dto.groupShowRatePerMinute,
      },
    });

    return updated;
  }

  async getTipMenu(creatorIdOrUserId: string) {
    const profile = await this.prisma.creatorProfile.findFirst({
      where: {
        OR: [{ id: creatorIdOrUserId }, { userId: creatorIdOrUserId }],
      },
      include: {
        tipMenuItems: {
          where: { isActive: true },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    if (!profile) {
      throw new NotFoundException('Creator profile not found');
    }

    return profile.tipMenuItems;
  }

  async addTipMenuItem(userId: string, dto: CreateTipMenuItemDto) {
    const profile = await this.prisma.creatorProfile.findUnique({
      where: { userId },
    });

    if (!profile || !profile.isApproved) {
      throw new ForbiddenException('Only approved verified creators can manage tip menu');
    }

    return this.prisma.tipMenuItem.create({
      data: {
        creatorId: profile.id,
        label: dto.label,
        tokenPrice: dto.tokenPrice,
        description: dto.description,
        sortOrder: dto.sortOrder || 0,
      },
    });
  }
}
