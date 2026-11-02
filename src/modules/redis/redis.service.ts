import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis | null = null;
  private isConnected = false;
  // In-memory fallback if Redis is offline during local dev/tests
  private readonly inMemoryStore = new Map<string, { value: string; expiresAt?: number }>();
  private readonly inMemorySets = new Map<string, Set<string>>();

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    const host = this.configService.get<string>('redis.host', 'localhost');
    const port = this.configService.get<number>('redis.port', 6379);
    const password = this.configService.get<string>('redis.password');

    try {
      this.client = new Redis({
        host,
        port,
        password: password || undefined,
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        retryStrategy: () => null, // Don't crash process if Redis is down
      });

      this.client.connect().then(() => {
        this.isConnected = true;
        this.logger.log(`Connected to Redis at ${host}:${port}`);
      }).catch((err) => {
        this.isConnected = false;
        this.logger.warn(`Redis connection failed (${err.message}). Using in-memory cache/coordination fallback.`);
      });

      this.client.on('error', (err) => {
        this.isConnected = false;
        // suppress repeating logs
      });
    } catch (e) {
      this.isConnected = false;
      this.logger.warn('Redis client initialization failed. Using in-memory fallback.');
    }
  }

  async onModuleDestroy() {
    if (this.client) {
      try {
        await this.client.quit();
      } catch {
        // ignore
      }
    }
  }

  async get(key: string): Promise<string | null> {
    if (this.isConnected && this.client) {
      try {
        return await this.client.get(key);
      } catch {
        // fall through
      }
    }
    const item = this.inMemoryStore.get(key);
    if (!item) return null;
    if (item.expiresAt && Date.now() > item.expiresAt) {
      this.inMemoryStore.delete(key);
      return null;
    }
    return item.value;
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (this.isConnected && this.client) {
      try {
        if (ttlSeconds) {
          await this.client.set(key, value, 'EX', ttlSeconds);
        } else {
          await this.client.set(key, value);
        }
        return;
      } catch {
        // fall through
      }
    }
    const expiresAt = ttlSeconds ? Date.now() + ttlSeconds * 1000 : undefined;
    this.inMemoryStore.set(key, { value, expiresAt });
  }

  async del(key: string): Promise<void> {
    if (this.isConnected && this.client) {
      try {
        await this.client.del(key);
        return;
      } catch {
        // fall through
      }
    }
    this.inMemoryStore.delete(key);
  }

  // Room Viewer Coordination
  async addRoomViewer(roomId: string, viewerId: string): Promise<number> {
    const key = `room:${roomId}:viewers`;
    if (this.isConnected && this.client) {
      try {
        await this.client.sadd(key, viewerId);
        return await this.client.scard(key);
      } catch {
        // fall through
      }
    }
    let set = this.inMemorySets.get(key);
    if (!set) {
      set = new Set<string>();
      this.inMemorySets.set(key, set);
    }
    set.add(viewerId);
    return set.size;
  }

  async removeRoomViewer(roomId: string, viewerId: string): Promise<number> {
    const key = `room:${roomId}:viewers`;
    if (this.isConnected && this.client) {
      try {
        await this.client.srem(key, viewerId);
        return await this.client.scard(key);
      } catch {
        // fall through
      }
    }
    const set = this.inMemorySets.get(key);
    if (set) {
      set.delete(viewerId);
      return set.size;
    }
    return 0;
  }

  async getRoomViewerCount(roomId: string): Promise<number> {
    const key = `room:${roomId}:viewers`;
    if (this.isConnected && this.client) {
      try {
        return await this.client.scard(key);
      } catch {
        // fall through
      }
    }
    const set = this.inMemorySets.get(key);
    return set ? set.size : 0;
  }

  // Distributed atomic lock (Redlock style)
  async acquireLock(resourceKey: string, lockToken: string, ttlSeconds = 10): Promise<boolean> {
    const key = `lock:${resourceKey}`;
    if (this.isConnected && this.client) {
      try {
        const result = await this.client.set(key, lockToken, 'PX', ttlSeconds * 1000, 'NX');
        return result === 'OK';
      } catch {
        // fall through
      }
    }
    const existing = this.inMemoryStore.get(key);
    if (existing && (!existing.expiresAt || existing.expiresAt > Date.now())) {
      return false;
    }
    this.inMemoryStore.set(key, { value: lockToken, expiresAt: Date.now() + ttlSeconds * 1000 });
    return true;
  }

  async releaseLock(resourceKey: string, lockToken: string): Promise<boolean> {
    const key = `lock:${resourceKey}`;
    if (this.isConnected && this.client) {
      try {
        const current = await this.client.get(key);
        if (current === lockToken) {
          await this.client.del(key);
          return true;
        }
        return false;
      } catch {
        // fall through
      }
    }
    const existing = this.inMemoryStore.get(key);
    if (existing && existing.value === lockToken) {
      this.inMemoryStore.delete(key);
      return true;
    }
    return false;
  }

  // Rate Limiting
  async checkRateLimit(key: string, limit: number, windowSeconds: number): Promise<{ allowed: boolean; remaining: number }> {
    const rateKey = `ratelimit:${key}`;
    const currentVal = await this.get(rateKey);
    const count = currentVal ? parseInt(currentVal, 10) : 0;
    if (count >= limit) {
      return { allowed: false, remaining: 0 };
    }
    await this.set(rateKey, (count + 1).toString(), windowSeconds);
    return { allowed: true, remaining: limit - (count + 1) };
  }
}
