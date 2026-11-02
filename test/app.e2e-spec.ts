import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';

describe('Velora Live API (e2e)', () => {
  let app: INestApplication;
  let mockPrisma: any;

  beforeAll(async () => {
    mockPrisma = {
      $connect: jest.fn().mockResolvedValue(undefined),
      $disconnect: jest.fn().mockResolvedValue(undefined),
      $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
      tokenPackage: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'pkg-1',
            name: 'Starter Pack',
            tokenAmount: 100,
            bonusTokens: 0,
            priceMinorUnits: 999,
            currency: 'USD',
            isActive: true,
          },
        ]),
      },
      streamRoom: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'room-1',
            title: 'Chill & Chat Lounge',
            isLive: true,
            currentViewerCount: 42,
            category: { name: 'Talk & Chill' },
            creator: {
              id: 'creator-1',
              username: 'aria_star',
              displayName: 'Aria Star',
              creatorProfile: { stageName: 'Aria Star', rating: 5 },
            },
          },
        ]),
      },
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(mockPrisma)
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalInterceptors(new TransformInterceptor());

    await app.init();
  }, 30000);

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('Health Checks', () => {
    it('/api/v1/health (GET)', () => {
      return request(app.getHttpServer())
        .get('/api/v1/health')
        .expect(200)
        .expect((res) => {
          expect(res.body.success).toBe(true);
          expect(res.body.data.status).toBe('ok');
          expect(res.body.data.subsystems.database).toBe('up');
        });
    });
  });

  describe('Public Catalogs', () => {
    it('/api/v1/token-packages (GET) should return token packages without authentication', () => {
      return request(app.getHttpServer())
        .get('/api/v1/token-packages')
        .expect(200)
        .expect((res) => {
          expect(res.body.success).toBe(true);
          expect(Array.isArray(res.body.data)).toBe(true);
          expect(res.body.data[0].name).toBe('Starter Pack');
        });
    });

    it('/api/v1/rooms (GET) should list stream rooms publicly', () => {
      return request(app.getHttpServer())
        .get('/api/v1/rooms')
        .expect(200)
        .expect((res) => {
          expect(res.body.success).toBe(true);
          expect(Array.isArray(res.body.data)).toBe(true);
          expect(res.body.data[0].title).toBe('Chill & Chat Lounge');
        });
    });
  });

  describe('Server-Enforced Authorization', () => {
    it('/api/v1/rooms (POST) should reject unauthenticated room creation with 401', () => {
      return request(app.getHttpServer())
        .post('/api/v1/rooms')
        .send({
          title: 'Unauthorized Room',
        })
        .expect(401)
        .expect((res) => {
          expect(res.body.success).toBe(false);
          expect(res.body.statusCode).toBe(401);
        });
    });

    it('/api/v1/admin/users (GET) should reject unauthenticated admin access with 401', () => {
      return request(app.getHttpServer())
        .get('/api/v1/admin/users')
        .expect(401)
        .expect((res) => {
          expect(res.body.success).toBe(false);
        });
    });

    it('/api/v1/creator/earnings (GET) should reject unauthenticated earnings access with 401', () => {
      return request(app.getHttpServer())
        .get('/api/v1/creator/earnings')
        .expect(401)
        .expect((res) => {
          expect(res.body.success).toBe(false);
        });
    });
  });
});
