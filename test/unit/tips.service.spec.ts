import { Test, TestingModule } from '@nestjs/testing';
import { TipsService } from '../../src/modules/tips/tips.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { WalletService } from '../../src/modules/wallet/wallet.service';
import { ChatGateway } from '../../src/modules/chat/chat.gateway';
import { AuditService } from '../../src/modules/audit/audit.service';
import { ConfigService } from '@nestjs/config';
import { ForbiddenException, BadRequestException } from '@nestjs/common';

describe('TipsService (Unit)', () => {
  let service: TipsService;
  let mockPrisma: any;
  let mockWalletService: any;
  let mockChatGateway: any;

  beforeEach(async () => {
    mockPrisma = {
      streamRoom: {
        findUnique: jest.fn(),
      },
      tipMenuItem: {
        findUnique: jest.fn(),
      },
      tip: {
        findUnique: jest.fn(),
        create: jest.fn(),
        findMany: jest.fn(),
      },
      creatorEarning: {
        create: jest.fn(),
      },
      streamSession: {
        updateMany: jest.fn(),
      },
      notification: {
        create: jest.fn(),
      },
      $transaction: jest.fn((callback) => callback(mockPrisma)),
    };

    mockWalletService = {
      debitTokens: jest.fn().mockResolvedValue({ id: 'debit-entry-1' }),
    };

    mockChatGateway = {
      broadcastTip: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TipsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: WalletService, useValue: mockWalletService },
        { provide: ChatGateway, useValue: mockChatGateway },
        { provide: AuditService, useValue: { log: jest.fn().mockResolvedValue(true) } },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultVal: any) => {
              if (key === 'economics.platformFeePercentage') return 20;
              if (key === 'economics.tokenUsdValueMinorUnits') return 10;
              return defaultVal;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<TipsService>(TipsService);
  });

  it('should reject tipping when creator tries to tip their own room', async () => {
    mockPrisma.streamRoom.findUnique.mockResolvedValue({
      id: 'room-1',
      creatorId: 'user-creator',
      allowTips: true,
    });

    await expect(
      service.sendTip('user-creator', {
        roomId: 'room-1',
        customTokenAmount: 50,
        idempotencyKey: 'idem-1',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('should reject tipping when room does not allow tips', async () => {
    mockPrisma.streamRoom.findUnique.mockResolvedValue({
      id: 'room-1',
      creatorId: 'user-creator',
      allowTips: false, // disabled!
    });

    await expect(
      service.sendTip('viewer-1', {
        roomId: 'room-1',
        customTokenAmount: 50,
        idempotencyKey: 'idem-1',
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('should calculate authoritative tip price from database and distribute revenue share', async () => {
    mockPrisma.streamRoom.findUnique.mockResolvedValue({
      id: 'room-1',
      creatorId: 'user-creator',
      allowTips: true,
    });
    mockPrisma.tip.findUnique.mockResolvedValue(null);
    mockPrisma.tipMenuItem.findUnique.mockResolvedValue({
      id: 'item-1',
      label: 'Special Dance',
      tokenPrice: 100, // 100 tokens = $10.00 (1000 minor units)
      isActive: true,
    });

    const mockCreatedTip = {
      id: 'tip-1',
      senderId: 'viewer-1',
      receiverId: 'user-creator',
      roomId: 'room-1',
      tokenAmount: 100,
      creatorEarningMinorUnits: 800, // 80% of $10.00 = $8.00 (800 cents)
      platformFeeMinorUnits: 200,   // 20% of $10.00 = $2.00 (200 cents)
      sender: { displayName: 'Happy Viewer' },
      createdAt: new Date(),
    };
    mockPrisma.tip.create.mockResolvedValue(mockCreatedTip);

    const result = await service.sendTip('viewer-1', {
      roomId: 'room-1',
      tipMenuItemId: 'item-1',
      idempotencyKey: 'idem-tip-100',
    });

    // Verify wallet debited 100 tokens
    expect(mockWalletService.debitTokens).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'viewer-1',
        amount: 100,
      }),
      expect.anything(),
    );

    // Verify creator earning recorded with net 800 minor units (20% fee deducted)
    expect(mockPrisma.creatorEarning.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          creatorId: 'user-creator',
          grossEarningMinorUnits: 1000,
          platformFeeMinorUnits: 200,
          netEarningMinorUnits: 800,
        }),
      }),
    );

    // Verify Socket.IO broadcast happened
    expect(mockChatGateway.broadcastTip).toHaveBeenCalledWith('room-1', expect.anything());
    expect(result.success).toBe(true);
  });
});
