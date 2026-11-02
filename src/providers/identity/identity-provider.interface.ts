export interface CreateVerificationSessionParams {
  userId: string;
  userEmail: string;
  returnUrl?: string;
}

export interface VerificationSessionResult {
  sessionId: string;
  verificationUrl: string;
  expiresAt: Date;
}

export interface VerificationStatusResult {
  sessionId: string;
  status: 'PENDING' | 'VERIFIED' | 'REJECTED' | 'EXPIRED';
  isAdult: boolean;
  verifiedAge?: number;
  documentVerified: boolean;
  selfieMatched: boolean;
  rejectionReason?: string;
  metadata?: Record<string, any>;
}

export interface IdentityProvider {
  createVerificationSession(params: CreateVerificationSessionParams): Promise<VerificationSessionResult>;
  checkSessionStatus(sessionId: string): Promise<VerificationStatusResult>;
  verifyWebhook(headers: Record<string, any>, payload: any): boolean;
}
