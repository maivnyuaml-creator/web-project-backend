import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import {
  IdentityProvider,
  CreateVerificationSessionParams,
  VerificationSessionResult,
  VerificationStatusResult,
} from './identity-provider.interface';

@Injectable()
export class SandboxIdentityProvider implements IdentityProvider {
  private readonly logger = new Logger(SandboxIdentityProvider.name);
  private readonly webhookSecret: string;
  private readonly appUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.webhookSecret = this.configService.get<string>(
      'identity.webhookSecret',
      'identity_webhook_secret_test_key',
    );
    this.appUrl = this.configService.get<string>('appUrl', 'http://localhost:3000');
  }

  async createVerificationSession(params: CreateVerificationSessionParams): Promise<VerificationSessionResult> {
    const sessionId = `ident_sess_${crypto.randomBytes(12).toString('hex')}`;
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    const verificationUrl = `${this.appUrl}/api/v1/verification/sandbox-flow?session=${sessionId}&userId=${params.userId}`;

    this.logger.log(`Created sandbox identity verification session ${sessionId} for user ${params.userId}`);

    return {
      sessionId,
      verificationUrl,
      expiresAt,
    };
  }

  async checkSessionStatus(sessionId: string): Promise<VerificationStatusResult> {
    // In sandbox, simulates verified status for test sessions
    return {
      sessionId,
      status: 'VERIFIED',
      isAdult: true,
      verifiedAge: 25,
      documentVerified: true,
      selfieMatched: true,
      metadata: {
        provider: 'sandbox',
        simulated: true,
        documentType: 'PASSPORT',
      },
    };
  }

  verifyWebhook(headers: Record<string, any>, payload: any): boolean {
    const signature = headers['x-identity-signature'];
    if (!signature) {
      return false;
    }
    const computed = crypto
      .createHmac('sha256', this.webhookSecret)
      .update(JSON.stringify(payload))
      .digest('hex');
    return signature === computed;
  }
}
