import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SandboxPaymentProvider } from '../../providers/payments/sandbox-payment.provider';
import { WalletService } from '../wallet/wallet.service';
import { AuditService } from '../audit/audit.service';
import { PaymentStatus, WebhookStatus, LedgerEntryType } from '@prisma/client';
import { CreateCheckoutDto, SandboxCheckoutCompleteDto } from './dto/payments.dto';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentProvider: SandboxPaymentProvider,
    private readonly walletService: WalletService,
    private readonly auditService: AuditService,
  ) {}

  async createCheckout(userId: string, dto: CreateCheckoutDto) {
    const pkg = await this.prisma.tokenPackage.findUnique({
      where: { id: dto.packageId, isActive: true },
    });

    if (!pkg) {
      throw new NotFoundException('Token package not found or inactive');
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    // Create session via payment provider
    const session = await this.paymentProvider.createCheckoutSession({
      userId,
      packageId: pkg.id,
      amountMinorUnits: pkg.priceMinorUnits,
      currency: pkg.currency,
      idempotencyKey: dto.idempotencyKey,
      customerEmail: user.email,
      returnUrl: dto.returnUrl,
    });

    // Record pending payment
    const payment = await this.prisma.payment.upsert({
      where: { idempotencyKey: dto.idempotencyKey },
      update: {},
      create: {
        userId,
        tokenPackageId: pkg.id,
        provider: 'sandbox',
        externalPaymentId: session.sessionId,
        idempotencyKey: dto.idempotencyKey,
        status: PaymentStatus.PENDING,
        amountMinorUnits: pkg.priceMinorUnits,
        currency: pkg.currency,
        tokensCredited: pkg.tokenAmount + pkg.bonusTokens,
      },
    });

    return {
      checkoutUrl: session.checkoutUrl,
      sessionId: session.sessionId,
      paymentId: payment.id,
      expiresAt: session.expiresAt,
    };
  }

  async handleWebhook(provider: string, headers: Record<string, any>, rawBody: any, payload: any) {
    // 1. Signature verification
    const isSignatureValid = this.paymentProvider.verifyWebhookSignature(headers, rawBody);
    if (!isSignatureValid) {
      this.logger.warn(`Rejected webhook with invalid signature from provider: ${provider}`);
      throw new BadRequestException('Invalid webhook signature');
    }

    const event = this.paymentProvider.parseWebhookEvent(headers, payload);

    // 2. Deduplicate webhook event
    const existingWebhook = await this.prisma.paymentWebhookEvent.findUnique({
      where: { idempotencyKey: event.idempotencyKey },
    });

    if (existingWebhook) {
      this.logger.log(`Duplicate webhook event ignored: ${event.idempotencyKey}`);
      return { success: true, duplicate: true };
    }

    // Record webhook event
    await this.prisma.paymentWebhookEvent.create({
      data: {
        provider,
        eventId: event.eventId,
        eventType: event.eventType,
        idempotencyKey: event.idempotencyKey,
        payload: event.rawPayload,
        status: WebhookStatus.PROCESSED,
      },
    });

    // 3. Process payment event
    if (event.eventType === 'payment.succeeded') {
      await this.processPaymentSuccess(event);
    }

    return { success: true, processed: true };
  }

  private async processPaymentSuccess(event: any) {
    // Find payment record
    const payment = await this.prisma.payment.findFirst({
      where: {
        OR: [
          { externalPaymentId: event.externalPaymentId },
          { idempotencyKey: event.idempotencyKey },
        ],
      },
      include: { tokenPackage: true, user: true },
    });

    if (!payment) {
      this.logger.error(`Received success webhook for unknown payment: ${event.externalPaymentId}`);
      return;
    }

    if (payment.status === PaymentStatus.COMPLETED) {
      this.logger.warn(`Payment ${payment.id} is already completed. Skipping credit.`);
      return;
    }

    const totalTokensToCredit = payment.tokenPackage.tokenAmount + payment.tokenPackage.bonusTokens;

    // Transactionally credit wallet and update payment status
    await this.prisma.$transaction(async (tx) => {
      // 1. Update payment to COMPLETED
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: PaymentStatus.COMPLETED,
          completedAt: new Date(),
          tokensCredited: totalTokensToCredit,
        },
      });

      // 2. Credit tokens exactly once
      await this.walletService.creditTokens(
        {
          userId: payment.userId,
          amount: totalTokensToCredit,
          type: LedgerEntryType.TOKEN_PURCHASE,
          referenceType: 'Payment',
          referenceId: payment.id,
          idempotencyKey: `credit_pay_${payment.id}`,
          metadata: {
            packageId: payment.tokenPackageId,
            amountMinorUnits: payment.amountMinorUnits,
            currency: payment.currency,
          },
        },
        tx,
      );

      // 3. Notification for user
      await tx.notification.create({
        data: {
          userId: payment.userId,
          type: 'PAYMENT_CONFIRMED',
          title: 'Tokens Added to Your Wallet! 🎉',
          body: `You received ${totalTokensToCredit} tokens from your ${payment.tokenPackage.name} purchase.`,
        },
      });
    });

    await this.auditService.log({
      actorId: payment.userId,
      action: 'PAYMENT_COMPLETED',
      entityType: 'Payment',
      entityId: payment.id,
      description: `Credited ${totalTokensToCredit} tokens for payment ${payment.id}`,
    });

    this.logger.log(`Successfully credited ${totalTokensToCredit} tokens to user ${payment.userId}`);
  }

  async completeSandboxPayment(dto: SandboxCheckoutCompleteDto) {
    const payment = await this.prisma.payment.findFirst({
      where: {
        OR: [{ externalPaymentId: dto.session }, { idempotencyKey: dto.idem }],
      },
      include: { tokenPackage: true },
    });

    if (!payment) {
      throw new NotFoundException('Payment session not found');
    }

    if (payment.status === PaymentStatus.COMPLETED) {
      return { success: true, message: 'Payment already completed', payment };
    }

    const totalTokens = payment.tokenPackage.tokenAmount + payment.tokenPackage.bonusTokens;

    await this.prisma.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: PaymentStatus.COMPLETED,
          completedAt: new Date(),
          tokensCredited: totalTokens,
        },
      });

      await this.walletService.creditTokens(
        {
          userId: payment.userId,
          amount: totalTokens,
          type: LedgerEntryType.TOKEN_PURCHASE,
          referenceType: 'Payment',
          referenceId: payment.id,
          idempotencyKey: `sandbox_credit_${payment.id}`,
        },
        tx,
      );

      await tx.notification.create({
        data: {
          userId: payment.userId,
          type: 'PAYMENT_CONFIRMED',
          title: 'Sandbox Tokens Added! 🪙',
          body: `You received ${totalTokens} tokens from sandbox checkout.`,
        },
      });
    });

    await this.auditService.log({
      actorId: payment.userId,
      action: 'SANDBOX_PAYMENT_COMPLETED',
      entityType: 'Payment',
      entityId: payment.id,
      description: `Completed sandbox payment ${payment.id}`,
    });

    return { success: true, message: 'Sandbox payment processed and tokens credited', tokensCredited: totalTokens };
  }

  async getHistory(userId: string) {
    return this.prisma.payment.findMany({
      where: { userId },
      include: {
        tokenPackage: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
