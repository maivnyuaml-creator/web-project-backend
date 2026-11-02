import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import * as crypto from 'crypto';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly jwtSecret: string;

  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    this.jwtSecret = this.configService.get<string>(
      'jwt.accessSecret',
      'velora-super-secret-access-token-key-change-in-production-min-32-chars',
    );
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const request = context.switchToHttp().getRequest();
    const token = this.extractTokenFromHeaderOrCookie(request);

    if (!token) {
      if (isPublic) {
        return true;
      }
      throw new UnauthorizedException('Authentication token missing');
    }

    try {
      const payload = this.verifyToken(token);
      
      // Load user and check status
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        include: {
          roles: true,
          creatorProfile: true,
        },
      });

      if (!user) {
        if (isPublic) return true;
        throw new UnauthorizedException('User account no longer exists');
      }

      if (user.isBanned) {
        throw new ForbiddenException(`Account suspended: ${user.bannedReason || 'Terms violation'}`);
      }

      if (user.lockedUntil && user.lockedUntil > new Date()) {
        throw new ForbiddenException('Account temporarily locked due to excessive failed attempts');
      }

      request.user = {
        id: user.id,
        email: user.email,
        username: user.username,
        roles: user.roles.map((r) => r.role),
        sessionId: payload.sessionId,
        isCreator: !!user.creatorProfile?.isApproved,
      };

      return true;
    } catch (error) {
      if (isPublic) {
        return true;
      }
      if (error instanceof ForbiddenException) {
        throw error;
      }
      throw new UnauthorizedException('Invalid or expired authentication token');
    }
  }

  private extractTokenFromHeaderOrCookie(request: any): string | null {
    const authHeader = request.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7).trim();
    }
    const cookieName = this.configService.get<string>('session.cookieName', 'velora_session');
    if (request.cookies && request.cookies[cookieName]) {
      return request.cookies[cookieName];
    }
    return null;
  }

  private verifyToken(token: string): { sub: string; sessionId?: string; exp: number } {
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new Error('Malformed token');
    }

    const [headerB64, payloadB64, signatureB64] = parts;
    const data = `${headerB64}.${payloadB64}`;
    const expectedSig = crypto
      .createHmac('sha256', this.jwtSecret)
      .update(data)
      .digest('base64url');

    if (signatureB64 !== expectedSig) {
      throw new Error('Invalid signature');
    }

    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    if (payload.exp && Date.now() / 1000 > payload.exp) {
      throw new Error('Token expired');
    }

    return payload;
  }
}
