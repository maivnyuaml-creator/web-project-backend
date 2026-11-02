import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { LedgerEntryType, Prisma } from '@prisma/client';
import * as crypto from 'crypto';

export interface CreditDebitParams {
  userId: string;
  amount: number;
  type: LedgerEntryType;
  referenceType: string;
  referenceId: string;
  idempotencyKey: string;
  metadata?: any;
}

@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
  ) {}

  async getWallet(userId: string) {
    let wallet = await this.prisma.wallet.findUnique({
      where: { userId },
    });

    if (!wallet) {
      wallet = await this.prisma.wallet.create({
        data: {
          userId,
          tokenBalance: 0,
        },
      });
    }

    return wallet;
  }

  async getLedgerEntries(userId: string, limit = 50, skip = 0) {
    const wallet = await this.getWallet(userId);

    const [entries, total] = await Promise.all([
      this.prisma.walletLedgerEntry.findMany({
        where: { walletId: wallet.id },
        take: limit,
        skip,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.walletLedgerEntry.count({
        where: { walletId: wallet.id },
      }),
    ]);

    return {
      entries,
      total,
      limit,
      skip,
      currentBalance: wallet.tokenBalance,
    };
  }

  /**
   * Transactionally credits tokens to user wallet exactly once (idempotent).
   */
  async creditTokens(params: CreditDebitParams, externalTx?: Prisma.TransactionClient) {
    const lockToken = crypto.randomBytes(8).toString('hex');
    const lockKey = `wallet:${params.userId}`;
    const acquired = await this.redisService.acquireLock(lockKey, lockToken, 10);

    try {
      const executeInTx = async (tx: Prisma.TransactionClient) => {
        // 1. Check idempotency: deduplicate
        const existingEntry = await tx.walletLedgerEntry.findUnique({
          where: { idempotencyKey: params.idempotencyKey },
        });

        if (existingEntry) {
          this.logger.warn(`Idempotency hit for credit key: ${params.idempotencyKey}`);
          return existingEntry;
        }

        // 2. Fetch wallet
        let wallet = await tx.wallet.findUnique({
          where: { userId: params.userId },
        });

        if (!wallet) {
          wallet = await tx.wallet.create({
            data: { userId: params.userId, tokenBalance: 0 },
          });
        }

        // 3. Atomically update balance
        const newBalance = wallet.tokenBalance + params.amount;
        await tx.wallet.update({
          where: { id: wallet.id },
          data: { tokenBalance: newBalance },
        });

        // 4. Record immutable ledger entry
        const entry = await tx.walletLedgerEntry.create({
          data: {
            walletId: wallet.id,
            type: params.type,
            amount: params.amount,
            balanceAfter: newBalance,
            referenceType: params.referenceType,
            referenceId: params.referenceId,
            idempotencyKey: params.idempotencyKey,
            metadata: params.metadata,
          },
        });

        return entry;
      };

      if (externalTx) {
        return await executeInTx(externalTx);
      }
      return await this.prisma.$transaction(executeInTx);
    } finally {
      if (acquired) {
        await this.redisService.releaseLock(lockKey, lockToken);
      }
    }
  }

  /**
   * Transactionally debits tokens from user wallet preventing concurrent double spending (idempotent).
   */
  async debitTokens(params: CreditDebitParams, externalTx?: Prisma.TransactionClient) {
    const lockToken = crypto.randomBytes(8).toString('hex');
    const lockKey = `wallet:${params.userId}`;
    const acquired = await this.redisService.acquireLock(lockKey, lockToken, 10);

    try {
      const executeInTx = async (tx: Prisma.TransactionClient) => {
        // 1. Check idempotency
        const existingEntry = await tx.walletLedgerEntry.findUnique({
          where: { idempotencyKey: params.idempotencyKey },
        });

        if (existingEntry) {
          this.logger.warn(`Idempotency hit for debit key: ${params.idempotencyKey}`);
          return existingEntry;
        }

        // 2. Fetch wallet
        const wallet = await tx.wallet.findUnique({
          where: { userId: params.userId },
        });

        if (!wallet) {
          throw new NotFoundException('Wallet not found');
        }

        if (wallet.isLocked) {
          throw new ForbiddenException('Wallet is locked by compliance or security');
        }

        // 3. Prevent double-spending & check balance
        if (wallet.tokenBalance < params.amount) {
          throw new BadRequestException(
            `Insufficient token balance. Required: ${params.amount}, Available: ${wallet.tokenBalance}`,
          );
        }

        // 4. Atomically update balance
        const newBalance = wallet.tokenBalance - params.amount;
        await tx.wallet.update({
          where: { id: wallet.id },
          data: { tokenBalance: newBalance },
        });

        // 5. Record immutable ledger entry
        const entry = await tx.walletLedgerEntry.create({
          data: {
            walletId: wallet.id,
            type: params.type,
            amount: -params.amount,
            balanceAfter: newBalance,
            referenceType: params.referenceType,
            referenceId: params.referenceId,
            idempotencyKey: params.idempotencyKey,
            metadata: params.metadata,
          },
        });

        return entry;
      };

      if (externalTx) {
        return await executeInTx(externalTx);
      }
      return await this.prisma.$transaction(executeInTx);
    } finally {
      if (acquired) {
        await this.redisService.releaseLock(lockKey, lockToken);
      }
    }
  }
}
