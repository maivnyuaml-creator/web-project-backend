import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class FavoritesService {
  constructor(private readonly prisma: PrismaService) {}

  async addFavorite(userId: string, creatorId: string) {
    if (userId === creatorId) {
      throw new BadRequestException('Cannot favorite yourself');
    }

    const creator = await this.prisma.user.findUnique({
      where: { id: creatorId },
      include: { creatorProfile: true },
    });

    if (!creator) throw new NotFoundException('Creator not found');

    const favorite = await this.prisma.favorite.upsert({
      where: { userId_creatorId: { userId, creatorId } },
      update: {},
      create: { userId, creatorId },
    });

    if (creator.creatorProfile) {
      await this.prisma.creatorProfile.update({
        where: { id: creator.creatorProfile.id },
        data: { followerCount: { increment: 1 } },
      });
    }

    return favorite;
  }

  async removeFavorite(userId: string, creatorId: string) {
    const existing = await this.prisma.favorite.findUnique({
      where: { userId_creatorId: { userId, creatorId } },
    });

    if (existing) {
      await this.prisma.favorite.delete({
        where: { userId_creatorId: { userId, creatorId } },
      });

      const profile = await this.prisma.creatorProfile.findUnique({
        where: { userId: creatorId },
      });

      if (profile && profile.followerCount > 0) {
        await this.prisma.creatorProfile.update({
          where: { id: profile.id },
          data: { followerCount: { decrement: 1 } },
        });
      }
    }

    return { success: true, message: 'Unfavorited creator' };
  }

  async getMyFavorites(userId: string) {
    return this.prisma.favorite.findMany({
      where: { userId },
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
                isLive: true,
                rating: true,
                followerCount: true,
              },
            },
            rooms: {
              where: { isLive: true },
              select: { id: true, title: true, currentViewerCount: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
