import { Test, TestingModule } from '@nestjs/testing';
import { WalletService } from '../../src/modules/wallet/wallet.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { RedisService } from '../../src/modules/redis/redis.service';
import { ConfigService } from '@nestjs/config';
import { LedgerEntryType } from '@prisma/client';
import { BadRequestException } from '@nestjs/common';

describe('WalletService (Unit)', () => {
  let service: WalletService;
  let mockPrisma: any;
  let mockRedis: any;

  beforeEach(async () => {
    mockPrisma = {
      wallet: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      walletLedgerEntry: {
        findUnique: jest.fn(),
        create: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
      },
      $transaction: jest.fn((callback) => callback(mockPrisma)),
    };

    mockRedis = {
      acquireLock: jest.fn().mockResolvedValue(true),
      releaseLock: jest.fn().mockResolvedValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WalletService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: mockRedis },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue(null) },
        },
      ],
    }).compile();

    service = module.get<WalletService>(WalletService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('creditTokens', () => {
    it('should credit tokens and record immutable ledger entry', async () => {
      mockPrisma.walletLedgerEntry.findUnique.mockResolvedValue(null);
      mockPrisma.wallet.findUnique.mockResolvedValue({ id: 'wallet-1', userId: 'user-1', tokenBalance: 100 });
      mockPrisma.wallet.update.mockResolvedValue({ id: 'wallet-1', tokenBalance: 200 });
      mockPrisma.walletLedgerEntry.create.mockResolvedValue({
        id: 'entry-1',
        walletId: 'wallet-1',
        amount: 100,
        balanceAfter: 200,
        type: LedgerEntryType.TOKEN_PURCHASE,
        idempotencyKey: 'idem-credit-1',
      });

      const result = await service.creditTokens({
        userId: 'user-1',
        amount: 100,
        type: LedgerEntryType.TOKEN_PURCHASE,
        referenceType: 'Payment',
        referenceId: 'pay-1',
        idempotencyKey: 'idem-credit-1',
      });

      expect(mockPrisma.wallet.update).toHaveBeenCalledWith({
        where: { id: 'wallet-1' },
        data: { tokenBalance: 200 },
      });
      expect(result.balanceAfter).toBe(200);
    });

    it('should deduplicate and return existing ledger entry on duplicate idempotency key', async () => {
      const existing = {
        id: 'entry-1',
        walletId: 'wallet-1',
        amount: 100,
        balanceAfter: 200,
        idempotencyKey: 'idem-credit-1',
      };
      mockPrisma.walletLedgerEntry.findUnique.mockResolvedValue(existing);

      const result = await service.creditTokens({
        userId: 'user-1',
        amount: 100,
        type: LedgerEntryType.TOKEN_PURCHASE,
        referenceType: 'Payment',
        referenceId: 'pay-1',
        idempotencyKey: 'idem-credit-1',
      });

      expect(mockPrisma.wallet.update).not.toHaveBeenCalled();
      expect(result).toBe(existing);
    });
  });

  describe('debitTokens', () => {
    it('should reject debit and throw BadRequestException when balance is insufficient (double-spend protection)', async () => {
      mockPrisma.walletLedgerEntry.findUnique.mockResolvedValue(null);
      mockPrisma.wallet.findUnique.mockResolvedValue({
        id: 'wallet-1',
        userId: 'user-1',
        tokenBalance: 40,
        isLocked: false,
      });

      await expect(
        service.debitTokens({
          userId: 'user-1',
          amount: 50, // requires 50, but only 40 available
          type: LedgerEntryType.TIP_DEBIT,
          referenceType: 'Tip',
          referenceId: 'tip-1',
          idempotencyKey: 'idem-debit-1',
        }),
      ).rejects.toThrow(BadRequestException);

      expect(mockPrisma.wallet.update).not.toHaveBeenCalled();
    });

    it('should debit tokens atomically when balance is sufficient', async () => {
      mockPrisma.walletLedgerEntry.findUnique.mockResolvedValue(null);
      mockPrisma.wallet.findUnique.mockResolvedValue({
        id: 'wallet-1',
        userId: 'user-1',
        tokenBalance: 150,
        isLocked: false,
      });
      mockPrisma.wallet.update.mockResolvedValue({ id: 'wallet-1', tokenBalance: 100 });
      mockPrisma.walletLedgerEntry.create.mockResolvedValue({
        id: 'entry-debit-1',
        walletId: 'wallet-1',
        amount: -50,
        balanceAfter: 100,
        type: LedgerEntryType.TIP_DEBIT,
        idempotencyKey: 'idem-debit-1',
      });

      const result = await service.debitTokens({
        userId: 'user-1',
        amount: 50,
        type: LedgerEntryType.TIP_DEBIT,
        referenceType: 'Tip',
        referenceId: 'tip-1',
        idempotencyKey: 'idem-debit-1',
      });

      expect(mockPrisma.wallet.update).toHaveBeenCalledWith({
        where: { id: 'wallet-1' },
        data: { tokenBalance: 100 },
      });
      expect(result.balanceAfter).toBe(100);
    });
  });
});
