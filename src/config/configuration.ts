export default () => ({
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  apiPrefix: process.env.API_PREFIX || '/api/v1',
  appUrl: process.env.APP_URL || 'http://localhost:3000',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3001',
  database: {
    url: process.env.DATABASE_URL,
  },
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
  },
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET || 'default-access-secret-min-32-chars-long',
    accessExpiration: process.env.JWT_ACCESS_EXPIRATION || '15m',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'default-refresh-secret-min-32-chars-long',
    refreshExpiration: process.env.JWT_REFRESH_EXPIRATION || '7d',
  },
  session: {
    cookieName: process.env.SESSION_COOKIE_NAME || 'velora_session',
    cookieSecret: process.env.COOKIE_SECRET || 'default-cookie-secret-min-32-chars-long',
  },
  security: {
    argon2MemoryCost: parseInt(process.env.ARGON2_MEMORY_COST || '65536', 10),
    argon2TimeCost: parseInt(process.env.ARGON2_TIME_COST || '3', 10),
    maxLoginAttempts: parseInt(process.env.MAX_LOGIN_ATTEMPTS || '5', 10),
    lockoutDurationMinutes: parseInt(process.env.LOCKOUT_DURATION_MINUTES || '15', 10),
  },
  economics: {
    platformFeePercentage: parseInt(process.env.PLATFORM_FEE_PERCENTAGE || '20', 10),
    tokenUsdValueMinorUnits: parseInt(process.env.TOKEN_USD_VALUE_MINOR_UNITS || '10', 10),
  },
  storage: {
    endpoint: process.env.S3_ENDPOINT || 'http://localhost:9000',
    region: process.env.S3_REGION || 'us-east-1',
    bucketPublic: process.env.S3_BUCKET_PUBLIC || 'velora-public-media',
    bucketProtected: process.env.S3_BUCKET_PROTECTED || 'velora-protected-media',
    accessKeyId: process.env.S3_ACCESS_KEY_ID || 'minioadmin',
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || 'minioadmin',
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
  },
  payments: {
    providerMode: process.env.PAYMENT_PROVIDER_MODE || 'sandbox',
    sandboxWebhookSecret: process.env.PAYMENT_SANDBOX_WEBHOOK_SECRET || 'velora_sandbox_webhook_secret_key_12345',
    merchantId: process.env.PAYMENT_MERCHANT_ID || 'sandbox_merchant_velora',
  },
  identity: {
    providerMode: process.env.IDENTITY_PROVIDER_MODE || 'sandbox',
    webhookSecret: process.env.IDENTITY_WEBHOOK_SECRET || 'identity_webhook_secret_test_key',
  },
  streaming: {
    providerMode: process.env.STREAMING_PROVIDER_MODE || 'sandbox',
    ingestBaseUrl: process.env.STREAMING_INGEST_BASE_URL || 'rtmp://localhost:1935/live',
    playbackBaseUrl: process.env.STREAMING_PLAYBACK_BASE_URL || 'http://localhost:8080/hls',
    webhookSecret: process.env.STREAMING_WEBHOOK_SECRET || 'streaming_webhook_secret_key',
  },
});
