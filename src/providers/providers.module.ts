import { Global, Module } from '@nestjs/common';
import { SandboxPaymentProvider } from './payments/sandbox-payment.provider';
import { SandboxIdentityProvider } from './identity/sandbox-identity.provider';
import { SandboxStreamingProvider } from './streaming/sandbox-streaming.provider';
import { S3StorageProvider } from './storage/s3-storage.provider';

@Global()
@Module({
  providers: [
    SandboxPaymentProvider,
    SandboxIdentityProvider,
    SandboxStreamingProvider,
    S3StorageProvider,
  ],
  exports: [
    SandboxPaymentProvider,
    SandboxIdentityProvider,
    SandboxStreamingProvider,
    S3StorageProvider,
  ],
})
export class ProvidersModule {}
