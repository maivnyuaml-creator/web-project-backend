import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { UpdateUserDto } from './dto/users.dto';
import { Role } from '@prisma/client';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        username: true,
        displayName: true,
        avatarUrl: true,
        bio: true,
        isEmailVerified: true,
        is2faEnabled: true,
        createdAt: true,
        roles: {
          select: { role: true },
        },
        wallet: {
          select: {
            tokenBalance: true,
            isLocked: true,
          },
        },
        creatorProfile: {
          select: {
            id: true,
            stageName: true,
            isApproved: true,
            isLive: true,
            rating: true,
            followerCount: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const rolesList = user.roles.map((r) => r.role);
    const primaryRole = rolesList.includes(Role.ADMINISTRATOR)
      ? 'ADMIN'
      : rolesList.includes(Role.MODERATOR)
        ? 'MODERATOR'
        : rolesList.includes(Role.VERIFIED_CREATOR)
          ? 'CREATOR'
          : 'VIEWER';

    return {
      ...user,
      roles: rolesList,
      role: primaryRole,
      emailVerified: user.isEmailVerified,
      twoFactorEnabled: user.is2faEnabled,
      tokenBalance: user.wallet?.tokenBalance ?? 0,
      status: 'ACTIVE',
    };
  }

  async updateMe(userId: string, dto: UpdateUserDto) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        displayName: dto.displayName,
        bio: dto.bio,
        avatarUrl: dto.avatarUrl,
      },
      select: {
        id: true,
        email: true,
        username: true,
        displayName: true,
        avatarUrl: true,
        bio: true,
      },
    });

    await this.auditService.log({
      actorId: userId,
      action: 'USER_PROFILE_UPDATED',
      entityType: 'User',
      entityId: userId,
      newValue: dto,
    });

    return user;
  }

  async getPublicProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        displayName: true,
        avatarUrl: true,
        bio: true,
        createdAt: true,
        creatorProfile: {
          select: {
            id: true,
            stageName: true,
            bio: true,
            avatarUrl: true,
            bannerUrl: true,
            isLive: true,
            rating: true,
            followerCount: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('User profile not found');
    }

    return user;
  }

  async deleteAccount(userId: string) {
    // Soft delete user and revoke all sessions for privacy/GDPR compliance
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: {
          deletedAt: new Date(),
          isBanned: true,
          bannedReason: 'Account self-deleted by user request',
        },
      }),
      this.prisma.userSession.updateMany({
        where: { userId },
        data: { isRevoked: true },
      }),
    ]);

    await this.auditService.log({
      actorId: userId,
      action: 'USER_ACCOUNT_DELETED',
      entityType: 'User',
      entityId: userId,
      description: 'Account self-deleted by user',
    });

    return { success: true, message: 'Account deactivated and scheduled for deletion' };
  }
}
