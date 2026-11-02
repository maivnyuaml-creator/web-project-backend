import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
  ) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Platform health check and subsystem status' })
  async getHealth() {
    let dbStatus = 'down';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      dbStatus = 'up';
    } catch {
      dbStatus = 'unreachable';
    }

    let redisStatus = 'up';
    try {
      await this.redisService.set('health_ping', 'ok', 5);
      const val = await this.redisService.get('health_ping');
      if (val !== 'ok') redisStatus = 'degraded';
    } catch {
      redisStatus = 'fallback';
    }

    return {
      status: dbStatus === 'up' ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      uptimeSeconds: process.uptime(),
      subsystems: {
        database: dbStatus,
        cacheAndPresence: redisStatus,
      },
    };
  }
}
