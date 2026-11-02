import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api/v1');
  app.use(cookieParser());

  // Global request validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Global exception filter and response envelope
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new TransformInterceptor());

  // CORS configured for Next.js frontend and flexible development
  const envFrontendUrls = process.env.FRONTEND_URL
    ? process.env.FRONTEND_URL.split(',').map((url) => url.trim().replace(/\/$/, ''))
    : [];

  const defaultAllowedOrigins = [
    'http://localhost:3000',
    'http://localhost:3001',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:3001',
    ...envFrontendUrls,
  ];

  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      // Allow requests with no origin (mobile apps, curl, server-to-server)
      if (!origin) return callback(null, true);

      // In development, allow any localhost/127.0.0.1 port
      const isLocalhost = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
      if (process.env.NODE_ENV !== 'production' && isLocalhost) {
        return callback(null, true);
      }

      if (defaultAllowedOrigins.includes(origin) || defaultAllowedOrigins.includes('*')) {
        return callback(null, true);
      }

      callback(new Error(`Origin ${origin} not allowed by CORS`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-Requested-With', 'Origin'],
  });

  // Swagger OpenAPI documentation
  const config = new DocumentBuilder()
    .setTitle('Velora Live API')
    .setDescription(
      'Velora Live Backend REST and Real-Time WebSocket API Specification for Adult Live Streaming Platform',
    )
    .setVersion('1.0.0')
    .addBearerAuth({
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
      description: 'Enter your access token or session token',
    })
    .addTag('Auth', 'Authentication, registration, password recovery, and 2FA')
    .addTag('Users', 'User profile retrieval and management')
    .addTag('Sessions', 'Active user sessions and revocation')
    .addTag('Verification', 'Identity and age verification sessions')
    .addTag('Creator Applications', 'Creator application onboarding and review')
    .addTag('Creators', 'Verified creator public profiles and tip menus')
    .addTag('Rooms', 'Stream rooms, broadcasts, and publishing credentials')
    .addTag('Chat', 'Room chat history and real-time Socket.IO')
    .addTag('Wallet', 'Token balances and immutable financial ledger')
    .addTag('Token Packages', 'Available token package catalog')
    .addTag('Payments', 'Checkout sessions, sandbox flows, and payment history')
    .addTag('Webhooks', 'Signed payment gateway webhooks')
    .addTag('Tips', 'Real-time tips and revenue distribution')
    .addTag('Shows', 'Private and group show sessions with minute billing')
    .addTag('Favorites', 'Favorite and follow creators')
    .addTag('Notifications', 'User notifications')
    .addTag('Creator Earnings', 'Creator revenue breakdown and balances')
    .addTag('Creator Payouts', 'Payout requests and payout accounts')
    .addTag('Media', 'Protected media assets and presigned access')
    .addTag('Reports & Safety', 'User reports, safety, and blocks')
    .addTag('Admin', 'Administrator operations and compliance audits')
    .addTag('Health', 'Platform health check and subsystem status')
    .addTag('Items', 'Sample items endpoints for frontend connectivity and demonstration')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`Velora Live Backend listening on port ${port}`);
  console.log(`Swagger OpenAPI Documentation: http://localhost:${port}/api/docs`);
}

void bootstrap();
