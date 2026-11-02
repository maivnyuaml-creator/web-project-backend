import { Test, TestingModule } from '@nestjs/testing';
import { RoomsService } from '../../src/modules/rooms/rooms.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { SandboxStreamingProvider } from '../../src/providers/streaming/sandbox-streaming.provider';
import { RedisService } from '../../src/modules/redis/redis.service';
import { AuditService } from '../../src/modules/audit/audit.service';
import { ForbiddenException } from '@nestjs/common';

describe('RoomsService (Unit)', () => {
  let service: RoomsService;
  let mockPrisma: any;
  let mockStreamingProvider: any;
  let mockRedis: any;

  beforeEach(async () => {
    mockPrisma = {
      streamRoom: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn(),
      },
      creatorProfile: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      streamSession: {
        create: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      streamIngestCredential: {
        create: jest.fn(),
        updateMany: jest.fn(),
      },
      $transaction: jest.fn((callback) => callback(mockPrisma)),
    };

    mockStreamingProvider = {
      provisionStream: jest.fn().mockResolvedValue({
        streamKey: 'raw-key-123',
        streamKeyHash: 'hash-123',
        ingestServerUrl: 'rtmp://localhost:1935/live',
        playbackUrl: 'http://localhost:8080/hls/room-1.m3u8',
      }),
      getPlaybackAccess: jest.fn().mockResolvedValue({
        playbackUrl: 'http://localhost:8080/hls/room-1.m3u8?token=test',
        isAllowed: true,
      }),
      endStream: jest.fn().mockResolvedValue(true),
    };

    mockRedis = {
      getRoomViewerCount: jest.fn().mockResolvedValue(42),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RoomsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SandboxStreamingProvider, useValue: mockStreamingProvider },
        { provide: RedisService, useValue: mockRedis },
        { provide: AuditService, useValue: { log: jest.fn().mockResolvedValue(true) } },
      ],
    }).compile();

    service = module.get<RoomsService>(RoomsService);
  });

  describe('goLive', () => {
    it('CRITICAL ACCEPTANCE CRITERIA: Unapproved creators must NEVER be permitted to broadcast', async () => {
      mockPrisma.streamRoom.findUnique.mockResolvedValue({
        id: 'room-1',
        creatorId: 'unapproved-creator-id',
        isLive: false,
        creator: {
          creatorProfile: {
            isApproved: false, // NOT approved!
          },
        },
      });

      await expect(service.goLive('room-1', 'unapproved-creator-id')).rejects.toThrow(
        ForbiddenException,
      );
      expect(mockPrisma.streamRoom.update).not.toHaveBeenCalled();
    });

    it('should allow approved verified creator to broadcast', async () => {
      mockPrisma.streamRoom.findUnique.mockResolvedValue({
        id: 'room-1',
        creatorId: 'approved-creator-id',
        isLive: false,
        creator: {
          creatorProfile: {
            isApproved: true, // APPROVED!
          },
        },
      });
      mockPrisma.streamRoom.update.mockResolvedValue({ id: 'room-1', isLive: true });
      mockPrisma.creatorProfile.update.mockResolvedValue({ userId: 'approved-creator-id', isLive: true });
      mockPrisma.streamSession.create.mockResolvedValue({ id: 'sess-1' });

      const result = await service.goLive('room-1', 'approved-creator-id');

      expect(mockPrisma.streamRoom.update).toHaveBeenCalledWith({
        where: { id: 'room-1' },
        data: { isLive: true },
      });
      expect(result.success).toBe(true);
    });
  });

  describe('rotateCredentials', () => {
    it('should revoke previous credentials and provision new stream key', async () => {
      mockPrisma.streamRoom.findUnique.mockResolvedValue({
        id: 'room-1',
        creatorId: 'creator-1',
        isPrivate: false,
      });

      const creds = await service.rotateCredentials('room-1', 'creator-1');

      expect(mockPrisma.streamIngestCredential.updateMany).toHaveBeenCalledWith({
        where: { roomId: 'room-1', isRevoked: false },
        data: { isRevoked: true },
      });
      expect(mockStreamingProvider.provisionStream).toHaveBeenCalled();
      expect(creds.streamKey).toBe('raw-key-123');
    });
  });
});
