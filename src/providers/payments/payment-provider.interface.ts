export interface CreateCheckoutSessionParams {
  userId: string;
  packageId: string;
  amountMinorUnits: number;
  currency: string;
  idempotencyKey: string;
  customerEmail: string;
  returnUrl?: string;
}

export interface CheckoutSessionResult {
  sessionId: string;
  checkoutUrl: string;
  provider: string;
  expiresAt: Date;
}

export interface WebhookEventPayload {
  provider: string;
  eventId: string;
  eventType: 'payment.succeeded' | 'payment.failed' | 'payment.refunded' | 'payment.chargeback';
  idempotencyKey: string;
  amountMinorUnits: number;
  currency: string;
  externalPaymentId: string;
  rawPayload: Record<string, any>;
}

export interface RefundParams {
  externalPaymentId: string;
  amountMinorUnits: number;
  reason: string;
}

export interface RefundResult {
  success: boolean;
  refundId: string;
  status: string;
}

export interface PaymentProvider {
  createCheckoutSession(params: CreateCheckoutSessionParams): Promise<CheckoutSessionResult>;
  verifyWebhookSignature(headers: Record<string, any>, rawBody: string | Buffer): boolean;
  parseWebhookEvent(headers: Record<string, any>, payload: any): WebhookEventPayload;
  processRefund(params: RefundParams): Promise<RefundResult>;
}
