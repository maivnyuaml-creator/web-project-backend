import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatService } from './chat.service';
import { RedisService } from '../redis/redis.service';
import { PrismaService } from '../../prisma/prisma.service';
import * as crypto from 'crypto';

@WebSocketGateway({
  cors: {
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      // Allow requests from all origins in development and trusted frontend
      callback(null, true);
    },
    credentials: true,
  },
  namespace: '/chat',
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(ChatGateway.name);
  private readonly jwtSecret: string;

  constructor(
    private readonly chatService: ChatService,
    private readonly redisService: RedisService,
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    this.jwtSecret = this.configService.get<string>(
      'jwt.accessSecret',
      'velora-super-secret-access-token-key-change-in-production-min-32-chars',
    );
  }

  async handleConnection(client: Socket) {
    try {
      const token =
        client.handshake.auth?.token ||
        client.handshake.headers['authorization']?.replace('Bearer ', '') ||
        client.handshake.query?.token;

      if (token) {
        const user = await this.authenticateToken(token as string);
        if (user) {
          client.data.user = user;
          client.data.userId = user.id;
          this.logger.log(`Socket connected: ${client.id} (User: ${user.username})`);
          client.emit('connected', { success: true, user });
          return;
        }
      }

      // Guest viewer (supports guest interaction in development / room preview)
      const guestId = `guest_${client.id.substring(0, 8)}`;
      client.data.user = { id: guestId, username: `Guest_${client.id.substring(0, 4)}`, isGuest: true };
      client.data.userId = guestId;
      this.logger.log(`Socket connected: ${client.id} (Guest: ${client.data.user.username})`);
      client.emit('connected', { success: true, user: client.data.user });
    } catch (e) {
      this.logger.warn(`Connection error on socket ${client.id}: ${e}`);
      client.disconnect();
    }
  }

  async handleDisconnect(client: Socket) {
    const roomId = client.data.currentRoomId;
    const userId = client.data.userId;

    if (roomId && userId) {
      try {
        const remainingCount = await this.redisService.removeRoomViewer(roomId, userId);
        this.server.to(roomId).emit('room:viewer-count', { roomId, count: remainingCount });
      } catch (err) {
        this.logger.warn(`Failed to update viewer count on disconnect: ${err}`);
      }
    }
    this.logger.log(`Socket disconnected: ${client.id}`);
  }

  // Support both 'room:join' and 'join_room'
  @SubscribeMessage('room:join')
  @SubscribeMessage('join_room')
  async handleRoomJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { roomId: string },
  ) {
    if (!payload?.roomId) return;
    const roomId = payload.roomId;

    // Leave previous room if joined
    if (client.data.currentRoomId) {
      await client.leave(client.data.currentRoomId);
      try {
        await this.redisService.removeRoomViewer(client.data.currentRoomId, client.data.userId);
      } catch {}
    }

    client.data.currentRoomId = roomId;
    await client.join(roomId);

    let count = 1;
    try {
      // Track ephemeral viewer presence in Redis
      count = await this.redisService.addRoomViewer(roomId, client.data.userId);

      // Update DB viewer count cache if live
      await this.prisma.streamRoom.updateMany({
        where: { id: roomId, isLive: true },
        data: { currentViewerCount: count },
      });
    } catch {
      // If Redis or DB is unavailable, calculate count from socket adapter
      count = this.server.sockets.adapter.rooms.get(roomId)?.size || 1;
    }

    this.server.to(roomId).emit('room:viewer-count', { roomId, count });
    this.server.to(roomId).emit('room:user-joined', {
      roomId,
      user: client.data.user,
      viewerCount: count,
    });

    return { success: true, roomId, viewerCount: count };
  }

  // Support both 'room:leave' and 'leave_room'
  @SubscribeMessage('room:leave')
  @SubscribeMessage('leave_room')
  async handleRoomLeave(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { roomId: string },
  ) {
    const roomId = payload?.roomId || client.data.currentRoomId;
    if (!roomId) return;

    await client.leave(roomId);
    client.data.currentRoomId = null;

    let count = 0;
    try {
      count = await this.redisService.removeRoomViewer(roomId, client.data.userId);
    } catch {
      count = this.server.sockets.adapter.rooms.get(roomId)?.size || 0;
    }

    this.server.to(roomId).emit('room:viewer-count', { roomId, count });
    this.server.to(roomId).emit('room:user-left', {
      roomId,
      user: client.data.user,
      viewerCount: count,
    });

    return { success: true };
  }

  // Support both 'chat:message' and 'send_message'
  @SubscribeMessage('chat:message')
  @SubscribeMessage('send_message')
  async handleChatMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { roomId?: string; content?: string; text?: string; message?: string },
  ) {
    const roomId = payload?.roomId || client.data.currentRoomId;
    const content = payload?.content || payload?.text || payload?.message;

    if (!roomId || !content || content.trim().length === 0) {
      client.emit('chat:error', { message: 'Missing roomId or message content' });
      return;
    }

    const user = client.data.user || {
      id: `guest_${client.id.substring(0, 8)}`,
      username: 'Guest',
      isGuest: true,
    };

    // If registered user and room exists in DB, persist message
    if (!user.isGuest) {
      try {
        const savedMessage = await this.chatService.saveMessage(roomId, user.id, content);
        this.server.to(roomId).emit('chat:message:new', savedMessage);
        this.server.to(roomId).emit('chat:message', savedMessage);
        return { success: true, message: savedMessage };
      } catch (err: any) {
        this.logger.warn(`Persistent save failed, falling back to ephemeral broadcast: ${err?.message}`);
      }
    }

    // Ephemeral / Guest message broadcast (ensures real-time chat works immediately for frontend testing)
    const ephemeralMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      roomId,
      userId: user.id,
      content: content.trim(),
      createdAt: new Date().toISOString(),
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName || user.username,
        avatarUrl: user.avatarUrl || null,
        isGuest: !!user.isGuest,
      },
    };

    this.server.to(roomId).emit('chat:message:new', ephemeralMessage);
    this.server.to(roomId).emit('chat:message', ephemeralMessage);
    return { success: true, message: ephemeralMessage };
  }

  // Broadcaster methods for other services (tips, shows, moderation)
  broadcastTip(roomId: string, tipData: any) {
    if (this.server) {
      this.server.to(roomId).emit('tip:created', tipData);
    }
  }

  broadcastShowUpdate(roomId: string, event: string, showData: any) {
    if (this.server) {
      this.server.to(roomId).emit(event, showData);
    }
  }

  broadcastModerationNotice(roomId: string, notice: any) {
    if (this.server) {
      this.server.to(roomId).emit('moderation:notice', notice);
    }
  }

  private async authenticateToken(token: string): Promise<any> {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return null;
      const [headerB64, payloadB64, sigB64] = parts;
      const expectedSig = crypto
        .createHmac('sha256', this.jwtSecret)
        .update(`${headerB64}.${payloadB64}`)
        .digest('base64url');

      if (sigB64 !== expectedSig) return null;

      const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
      if (payload.exp && Date.now() / 1000 > payload.exp) return null;

      return await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: { id: true, username: true, displayName: true, avatarUrl: true, isBanned: true },
      });
    } catch {
      return null;
    }
  }
}
