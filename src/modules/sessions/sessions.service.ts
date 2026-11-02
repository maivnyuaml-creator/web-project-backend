import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class SessionsService {
  constructor(private readonly prisma: PrismaService) {}

  async getUserSessions(userId: string) {
    const sessions = await this.prisma.userSession.findMany({
      where: {
        userId,
        isRevoked: false,
        expiresAt: { gt: new Date() },
      },
      select: {
        id: true,
        ipAddress: true,
        userAgent: true,
        createdAt: true,
        expiresAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    return sessions;
  }

  async revokeSession(userId: string, sessionId: string) {
    const session = await this.prisma.userSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    if (session.userId !== userId) {
      throw new ForbiddenException('Cannot revoke another user session');
    }

    await this.prisma.userSession.update({
      where: { id: sessionId },
      data: { isRevoked: true },
    });

    return { success: true, message: 'Session revoked' };
  }

  async revokeOtherSessions(userId: string, currentSessionId?: string) {
    await this.prisma.userSession.updateMany({
      where: {
        userId,
        id: currentSessionId ? { not: currentSessionId } : undefined,
        isRevoked: false,
      },
      data: { isRevoked: true },
    });

    return { success: true, message: 'All other sessions revoked' };
  }
}
