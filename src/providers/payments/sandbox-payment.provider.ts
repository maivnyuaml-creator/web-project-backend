import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import {
  PaymentProvider,
  CreateCheckoutSessionParams,
  CheckoutSessionResult,
  WebhookEventPayload,
  RefundParams,
  RefundResult,
} from './payment-provider.interface';

@Injectable()
export class SandboxPaymentProvider implements PaymentProvider {
  private readonly logger = new Logger(SandboxPaymentProvider.name);
  private readonly webhookSecret: string;
  private readonly appUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.webhookSecret = this.configService.get<string>(
      'payments.sandboxWebhookSecret',
      'velora_sandbox_webhook_secret_key_12345',
    );
    this.appUrl = this.configService.get<string>('appUrl', 'http://localhost:3000');
  }

  async createCheckoutSession(params: CreateCheckoutSessionParams): Promise<CheckoutSessionResult> {
    const sessionId = `sbx_sess_${crypto.randomBytes(12).toString('hex')}`;
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

    // In sandbox, the checkout URL points to a hosted mock payment form endpoint
    const checkoutUrl = `${this.appUrl}/api/v1/payments/sandbox-checkout?session=${sessionId}&amount=${params.amountMinorUnits}&currency=${params.currency}&pkg=${params.packageId}&idem=${params.idempotencyKey}`;

    this.logger.log(`Created sandbox checkout session ${sessionId} for user ${params.userId}, amount: ${params.amountMinorUnits}`);

    return {
      sessionId,
      checkoutUrl,
      provider: 'sandbox',
      expiresAt,
    };
  }

  verifyWebhookSignature(headers: Record<string, any>, rawBody: string | Buffer): boolean {
    const signature = headers['x-velora-signature'] || headers['x-signature'];
    if (!signature) {
      this.logger.warn('Webhook verification failed: missing signature header');
      return false;
    }

    const payload = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8');
    const computed = crypto
      .createHmac('sha256', this.webhookSecret)
      .update(payload)
      .digest('hex');

    const isValid = crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(computed));
    if (!isValid) {
      this.logger.warn('Webhook verification failed: signature mismatch');
    }
    return isValid;
  }

  parseWebhookEvent(headers: Record<string, any>, payload: any): WebhookEventPayload {
    return {
      provider: 'sandbox',
      eventId: payload.eventId || `evt_${crypto.randomBytes(8).toString('hex')}`,
      eventType: payload.eventType,
      idempotencyKey: payload.idempotencyKey,
      amountMinorUnits: Number(payload.amountMinorUnits),
      currency: payload.currency || 'USD',
      externalPaymentId: payload.externalPaymentId || payload.paymentId,
      rawPayload: payload,
    };
  }

  async processRefund(params: RefundParams): Promise<RefundResult> {
    this.logger.log(`Processed sandbox refund for payment ${params.externalPaymentId}, amount: ${params.amountMinorUnits}`);
    return {
      success: true,
      refundId: `sbx_ref_${crypto.randomBytes(8).toString('hex')}`,
      status: 'COMPLETED',
    };
  }
}
