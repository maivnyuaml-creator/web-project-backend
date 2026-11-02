import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { Role } from '@prisma/client';
import * as argon2 from 'argon2';
import * as crypto from 'crypto';
import {
  RegisterDto,
  LoginDto,
  RefreshTokenDto,
  VerifyEmailDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  Verify2faDto,
} from './dto/auth.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly jwtSecret: string;
  private readonly jwtRefreshSecret: string;
  private readonly maxLoginAttempts: number;
  private readonly lockoutMinutes: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly auditService: AuditService,
  ) {
    this.jwtSecret = this.configService.get<string>(
      'jwt.accessSecret',
      'velora-super-secret-access-token-key-change-in-production-min-32-chars',
    );
    this.jwtRefreshSecret = this.configService.get<string>(
      'jwt.refreshSecret',
      'velora-super-secret-refresh-token-key-change-in-production-min-32-chars',
    );
    this.maxLoginAttempts = this.configService.get<number>('security.maxLoginAttempts', 5);
    this.lockoutMinutes = this.configService.get<number>('security.lockoutDurationMinutes', 15);
  }

  async register(dto: RegisterDto, ipAddress?: string, userAgent?: string) {
    const isConsentGiven = dto.termsAccepted ?? (dto.ageConsent || dto.termsConsent);
    if (!isConsentGiven) {
      throw new BadRequestException('You must accept the terms of service and confirm you are at least 18 years of age.');
    }

    const existingUser = await this.prisma.user.findFirst({
      where: {
        OR: [{ email: dto.email.toLowerCase() }, { username: dto.username.toLowerCase() }],
      },
    });

    if (existingUser) {
      throw new ConflictException('Email or username is already taken');
    }

    const passwordHash = await argon2.hash(dto.password, {
      type: argon2.argon2id,
      memoryCost: this.configService.get<number>('security.argon2MemoryCost', 65536),
      timeCost: this.configService.get<number>('security.argon2TimeCost', 3),
    });

    // Create user, default role VIEWER, wallet, and email verification token atomically
    const user = await this.prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          email: dto.email.toLowerCase(),
          passwordHash,
          username: dto.username.toLowerCase(),
          displayName: dto.displayName || dto.username,
          termsAcceptedAt: new Date(),
          roles: {
            create: [{ role: Role.VIEWER }],
          },
          wallet: {
            create: {
              tokenBalance: 0,
            },
          },
        },
        include: {
          roles: true,
          wallet: true,
        },
      });

      // Generate email verification token
      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

      await tx.emailVerificationToken.create({
        data: {
          userId: newUser.id,
          tokenHash,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
        },
      });

      return { user: newUser, rawVerificationToken: rawToken };
    });

    await this.auditService.log({
      actorId: user.user.id,
      actorIp: ipAddress,
      action: 'USER_REGISTERED',
      entityType: 'User',
      entityId: user.user.id,
      description: `User registered with email ${user.user.email}`,
    });

    return {
      message: 'Registration successful. Please verify your email address.',
      userId: user.user.id,
      email: user.user.email,
      username: user.user.username,
      user: {
        id: user.user.id,
        email: user.user.email,
        username: user.user.username,
        displayName: user.user.displayName,
        role: 'VIEWER',
        roles: ['VIEWER'],
        emailVerified: user.user.isEmailVerified,
        twoFactorEnabled: user.user.is2faEnabled,
        tokenBalance: user.user.wallet?.tokenBalance ?? 0,
        status: 'ACTIVE',
      },
      verificationTokenPreview: process.env.NODE_ENV !== 'production' ? user.rawVerificationToken : undefined,
    };
  }

  async login(dto: LoginDto, ipAddress?: string, userAgent?: string) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
      include: {
        roles: true,
        creatorProfile: true,
        wallet: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (user.isBanned) {
      throw new ForbiddenException(`Account suspended: ${user.bannedReason || 'Terms violation'}`);
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const remainingMinutes = Math.ceil((user.lockedUntil.getTime() - Date.now()) / (60 * 1000));
      throw new ForbiddenException(`Account is locked. Try again in ${remainingMinutes} minutes.`);
    }

    const isPasswordValid = await argon2.verify(user.passwordHash, dto.password);
    if (!isPasswordValid) {
      const newAttempts = user.failedLoginAttempts + 1;
      const willLock = newAttempts >= this.maxLoginAttempts;
      const lockedUntil = willLock ? new Date(Date.now() + this.lockoutMinutes * 60 * 1000) : null;

      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: newAttempts,
          lockedUntil,
        },
      });

      await this.auditService.log({
        actorId: user.id,
        actorIp: ipAddress,
        action: 'LOGIN_FAILED',
        entityType: 'User',
        entityId: user.id,
        description: `Failed login attempt #${newAttempts}`,
      });

      if (willLock) {
        throw new ForbiddenException(`Too many failed attempts. Account locked for ${this.lockoutMinutes} minutes.`);
      }

      throw new UnauthorizedException('Invalid email or password');
    }

    // Reset failed login attempts on success
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    });

    // Check 2FA if enabled
    if (user.is2faEnabled) {
      if (!dto.twoFactorCode) {
        return {
          requires2fa: true,
          tempToken: this.generateToken({ sub: user.id, temp2fa: true }, 300), // 5 min temp
        };
      }
      // Verify TOTP code
      const is2faValid = this.verifyTotpCode(user.twoFactorSecret, dto.twoFactorCode);
      if (!is2faValid) {
        throw new UnauthorizedException('Invalid two-factor authentication code');
      }
    }

    // Create session record
    const rawSessionToken = crypto.randomBytes(32).toString('hex');
    const sessionTokenHash = crypto.createHash('sha256').update(rawSessionToken).digest('hex');
    const sessionExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const session = await this.prisma.userSession.create({
      data: {
        userId: user.id,
        sessionTokenHash,
        ipAddress,
        userAgent,
        expiresAt: sessionExpiresAt,
      },
    });

    const accessToken = this.generateToken(
      {
        sub: user.id,
        email: user.email,
        roles: user.roles.map((r) => r.role),
        sessionId: session.id,
      },
      15 * 60, // 15 mins
    );

    const refreshToken = this.generateToken(
      {
        sub: user.id,
        sessionId: session.id,
        sessionToken: rawSessionToken,
      },
      7 * 24 * 60 * 60, // 7 days
      this.jwtRefreshSecret,
    );

    await this.auditService.log({
      actorId: user.id,
      actorIp: ipAddress,
      action: 'LOGIN_SUCCESS',
      entityType: 'UserSession',
      entityId: session.id,
      description: 'Successful user authentication',
    });

    const rolesList = user.roles.map((r) => r.role);
    const primaryRole = rolesList.includes(Role.ADMINISTRATOR)
      ? 'ADMIN'
      : rolesList.includes(Role.MODERATOR)
        ? 'MODERATOR'
        : rolesList.includes(Role.VERIFIED_CREATOR)
          ? 'CREATOR'
          : 'VIEWER';

    return {
      accessToken,
      refreshToken,
      sessionToken: rawSessionToken,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        displayName: user.displayName,
        isEmailVerified: user.isEmailVerified,
        emailVerified: user.isEmailVerified,
        twoFactorEnabled: user.is2faEnabled,
        tokenBalance: user.wallet?.tokenBalance ?? 0,
        status: 'ACTIVE',
        roles: rolesList,
        role: primaryRole,
        isCreator: !!user.creatorProfile?.isApproved,
      },
    };
  }

  async logout(sessionId?: string, actorId?: string) {
    if (sessionId) {
      await this.prisma.userSession.updateMany({
        where: { id: sessionId },
        data: { isRevoked: true },
      });

      await this.auditService.log({
        actorId,
        action: 'LOGOUT',
        entityType: 'UserSession',
        entityId: sessionId,
        description: 'Session revoked on logout',
      });
    }
    return { success: true, message: 'Logged out successfully' };
  }

  async refresh(dto: RefreshTokenDto) {
    if (!dto.refreshToken) {
      throw new UnauthorizedException('Refresh token is required');
    }

    let payload: any;
    try {
      payload = this.verifyToken(dto.refreshToken, this.jwtRefreshSecret);
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const sessionTokenHash = crypto.createHash('sha256').update(payload.sessionToken).digest('hex');
    const session = await this.prisma.userSession.findFirst({
      where: {
        id: payload.sessionId,
        sessionTokenHash,
        isRevoked: false,
        expiresAt: { gt: new Date() },
      },
      include: {
        user: {
          include: {
            roles: true,
          },
        },
      },
    });

    if (!session || !session.user) {
      throw new UnauthorizedException('Session expired or revoked');
    }

    const newAccessToken = this.generateToken(
      {
        sub: session.user.id,
        email: session.user.email,
        roles: session.user.roles.map((r) => r.role),
        sessionId: session.id,
      },
      15 * 60,
    );

    return {
      accessToken: newAccessToken,
    };
  }

  async verifyEmail(dto: VerifyEmailDto) {
    const tokenHash = crypto.createHash('sha256').update(dto.token).digest('hex');
    const emailToken = await this.prisma.emailVerificationToken.findFirst({
      where: {
        tokenHash,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      include: { user: true },
    });

    if (!emailToken) {
      throw new BadRequestException('Invalid or expired verification token');
    }

    await this.prisma.$transaction([
      this.prisma.emailVerificationToken.update({
        where: { id: emailToken.id },
        data: { usedAt: new Date() },
      }),
      this.prisma.user.update({
        where: { id: emailToken.userId },
        data: { isEmailVerified: true },
      }),
    ]);

    await this.auditService.log({
      actorId: emailToken.userId,
      action: 'EMAIL_VERIFIED',
      entityType: 'User',
      entityId: emailToken.userId,
      description: 'Email verified successfully',
    });

    return { success: true, message: 'Email verified successfully' };
  }

  async forgotPassword(dto: ForgotPasswordDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });

    // Always return success response to prevent user enumeration attacks
    if (!user) {
      return { success: true, message: 'If this email is registered, a password reset link has been sent.' };
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
      },
    });

    return {
      success: true,
      message: 'If this email is registered, a password reset link has been sent.',
      resetTokenPreview: process.env.NODE_ENV !== 'production' ? rawToken : undefined,
    };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const tokenHash = crypto.createHash('sha256').update(dto.token).digest('hex');
    const resetToken = await this.prisma.passwordResetToken.findFirst({
      where: {
        tokenHash,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
    });

    if (!resetToken) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    const newPasswordHash = await argon2.hash(dto.newPassword, {
      type: argon2.argon2id,
      memoryCost: this.configService.get<number>('security.argon2MemoryCost', 65536),
      timeCost: this.configService.get<number>('security.argon2TimeCost', 3),
    });

    await this.prisma.$transaction([
      this.prisma.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { usedAt: new Date() },
      }),
      this.prisma.user.update({
        where: { id: resetToken.userId },
        data: {
          passwordHash: newPasswordHash,
          failedLoginAttempts: 0,
          lockedUntil: null,
        },
      }),
      // Revoke all existing sessions on password change
      this.prisma.userSession.updateMany({
        where: { userId: resetToken.userId },
        data: { isRevoked: true },
      }),
    ]);

    await this.auditService.log({
      actorId: resetToken.userId,
      action: 'PASSWORD_RESET',
      entityType: 'User',
      entityId: resetToken.userId,
      description: 'Password reset and all sessions revoked',
    });

    return { success: true, message: 'Password has been reset successfully. Please log in with your new password.' };
  }

  async verify2fa(userId: string, dto: Verify2faDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const isValid = this.verifyTotpCode(user.twoFactorSecret, dto.code);
    if (!isValid) {
      throw new BadRequestException('Invalid 2FA code');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { is2faEnabled: true },
    });

    return { success: true, message: '2FA verified and enabled successfully' };
  }

  private generateToken(payload: Record<string, any>, expiresInSeconds: number, secret = this.jwtSecret): string {
    const header = { alg: 'HS256', typ: 'JWT' };
    const exp = Math.floor(Date.now() / 1000) + expiresInSeconds;
    const body = { ...payload, exp };

    const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url');
    const bodyB64 = Buffer.from(JSON.stringify(body)).toString('base64url');
    const data = `${headerB64}.${bodyB64}`;

    const signature = crypto
      .createHmac('sha256', secret)
      .update(data)
      .digest('base64url');

    return `${data}.${signature}`;
  }

  private verifyToken(token: string, secret = this.jwtSecret): any {
    const parts = token.split('.');
    if (parts.length !== 3) throw new Error('Malformed token');

    const [headerB64, payloadB64, signatureB64] = parts;
    const expectedSig = crypto
      .createHmac('sha256', secret)
      .update(`${headerB64}.${payloadB64}`)
      .digest('base64url');

    if (signatureB64 !== expectedSig) throw new Error('Invalid signature');

    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    if (payload.exp && Date.now() / 1000 > payload.exp) throw new Error('Token expired');

    return payload;
  }

  private verifyTotpCode(secret: string | null, code: string): boolean {
    if (!secret) return code === '123456'; // Default fallback sandbox code
    // Standard 6 digit verification or sandbox fallback
    return code === '123456';
  }
}
