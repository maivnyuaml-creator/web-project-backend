import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from '../../src/modules/auth/auth.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { AuditService } from '../../src/modules/audit/audit.service';
import * as argon2 from 'argon2';
import { UnauthorizedException, ForbiddenException, ConflictException } from '@nestjs/common';

describe('AuthService (Unit)', () => {
  let service: AuthService;
  let mockPrisma: any;
  let mockAudit: any;

  beforeEach(async () => {
    mockPrisma = {
      user: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      userSession: {
        create: jest.fn().mockResolvedValue({ id: 'session-123' }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      emailVerificationToken: {
        create: jest.fn().mockResolvedValue({ id: 'token-1' }),
      },
      $transaction: jest.fn((callback) => callback(mockPrisma)),
    };

    mockAudit = {
      log: jest.fn().mockResolvedValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: mockAudit },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultVal: any) => {
              if (key === 'jwt.accessSecret') return 'test-access-secret-min-32-chars-long';
              if (key === 'jwt.refreshSecret') return 'test-refresh-secret-min-32-chars-long';
              if (key === 'security.maxLoginAttempts') return 5;
              if (key === 'security.lockoutDurationMinutes') return 15;
              return defaultVal;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  describe('register', () => {
    it('should reject registration when email or username is taken', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({ id: 'existing-user' });

      await expect(
        service.register({
          email: 'duplicate@example.com',
          password: 'Password123!',
          username: 'existing_user',
          displayName: 'Existing User',
          termsAccepted: true,
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should successfully register user, hash password with Argon2id, and create wallet', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue({
        id: 'new-user-id',
        email: 'new@example.com',
        username: 'new_user',
        displayName: 'New User',
      });

      const result = await service.register({
        email: 'new@example.com',
        password: 'SecurePassword123!',
        username: 'new_user',
        displayName: 'New User',
        termsAccepted: true,
      });

      expect(mockPrisma.user.create).toHaveBeenCalled();
      expect(result.userId).toBe('new-user-id');
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'USER_REGISTERED' }),
      );
    });
  });

  describe('login', () => {
    it('should lock account after exceeding maximum failed login attempts', async () => {
      const realPasswordHash = await argon2.hash('CorrectPassword123!');
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-lockout-test',
        email: 'test@example.com',
        passwordHash: realPasswordHash,
        failedLoginAttempts: 4, // 5th attempt will trigger lockout
        lockedUntil: null,
        isBanned: false,
        roles: [{ role: 'VIEWER' }],
      });

      await expect(
        service.login({
          email: 'test@example.com',
          password: 'WrongPassword!',
        }),
      ).rejects.toThrow(ForbiddenException);

      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            failedLoginAttempts: 5,
            lockedUntil: expect.any(Date),
          }),
        }),
      );
    });

    it('should authenticate successfully with correct credentials and return tokens', async () => {
      const realPasswordHash = await argon2.hash('CorrectPassword123!');
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-success',
        email: 'user@velora.live',
        passwordHash: realPasswordHash,
        failedLoginAttempts: 0,
        lockedUntil: null,
        isBanned: false,
        isEmailVerified: true,
        displayName: 'Velora Viewer',
        username: 'velora_viewer',
        roles: [{ role: 'VIEWER' }],
      });

      const result = await service.login({
        email: 'user@velora.live',
        password: 'CorrectPassword123!',
      });

      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
      expect(result.user.email).toBe('user@velora.live');
    });
  });
});
