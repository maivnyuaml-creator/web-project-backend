import { SandboxPaymentProvider } from '../../src/providers/payments/sandbox-payment.provider';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

describe('SandboxPaymentProvider (Unit)', () => {
  let provider: SandboxPaymentProvider;
  const secret = 'test-secret-key-12345';

  beforeEach(() => {
    const mockConfig = {
      get: jest.fn((key: string, defaultVal: any) => {
        if (key === 'payments.sandboxWebhookSecret') return secret;
        if (key === 'appUrl') return 'http://localhost:3000';
        return defaultVal;
      }),
    } as unknown as ConfigService;

    provider = new SandboxPaymentProvider(mockConfig);
  });

  it('should verify valid HMAC-SHA256 signature', () => {
    const payload = JSON.stringify({
      eventId: 'evt_123',
      eventType: 'payment.succeeded',
      amountMinorUnits: 4999,
      idempotencyKey: 'idem-1',
    });

    const validSignature = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');

    const headers = { 'x-velora-signature': validSignature };
    const isValid = provider.verifyWebhookSignature(headers, payload);

    expect(isValid).toBe(true);
  });

  it('should reject invalid or tampered signature', () => {
    const payload = JSON.stringify({ amount: 100 });
    const forgedSignature = crypto.createHmac('sha256', 'wrong-secret').update(payload).digest('hex');

    const headers = { 'x-velora-signature': forgedSignature };
    const isValid = provider.verifyWebhookSignature(headers, payload);

    expect(isValid).toBe(false);
  });

  it('should reject missing signature header', () => {
    const payload = JSON.stringify({ amount: 100 });
    const headers = {};
    const isValid = provider.verifyWebhookSignature(headers, payload);

    expect(isValid).toBe(false);
  });
});
