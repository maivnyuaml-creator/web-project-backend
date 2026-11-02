import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import {
  StreamingProvider,
  ProvisionStreamParams,
  StreamCredentialsResult,
  PlaybackAccessParams,
  PlaybackAccessResult,
} from './streaming-provider.interface';

@Injectable()
export class SandboxStreamingProvider implements StreamingProvider {
  private readonly logger = new Logger(SandboxStreamingProvider.name);
  private readonly ingestBaseUrl: string;
  private readonly playbackBaseUrl: string;
  private readonly webhookSecret: string;

  constructor(private readonly configService: ConfigService) {
    this.ingestBaseUrl = this.configService.get<string>(
      'streaming.ingestBaseUrl',
      'rtmp://localhost:1935/live',
    );
    this.playbackBaseUrl = this.configService.get<string>(
      'streaming.playbackBaseUrl',
      'http://localhost:8080/hls',
    );
    this.webhookSecret = this.configService.get<string>(
      'streaming.webhookSecret',
      'streaming_webhook_secret_key',
    );
  }

  async provisionStream(params: ProvisionStreamParams): Promise<StreamCredentialsResult> {
    const rawStreamKey = `live_${params.roomId}_${crypto.randomBytes(16).toString('hex')}`;
    const streamKeyHash = crypto.createHash('sha256').update(rawStreamKey).digest('hex');

    const ingestServerUrl = this.ingestBaseUrl;
    const playbackUrl = `${this.playbackBaseUrl}/${params.roomId}.m3u8`;

    this.logger.log(`Provisioned streaming credentials for room ${params.roomId}`);

    return {
      streamKey: rawStreamKey,
      streamKeyHash,
      ingestServerUrl,
      playbackUrl,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
    };
  }

  async revokeStreamCredentials(streamKeyHash: string): Promise<boolean> {
    this.logger.log(`Revoked streaming credential hash ${streamKeyHash}`);
    return true;
  }

  async getPlaybackAccess(params: PlaybackAccessParams): Promise<PlaybackAccessResult> {
    // Generate signed playback URL with short expiration
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 min token
    const token = crypto
      .createHmac('sha256', this.webhookSecret)
      .update(`${params.roomId}:${expiresAt.getTime()}:${params.viewerId ?? 'anon'}`)
      .digest('hex');

    const signedPlaybackUrl = `${this.playbackBaseUrl}/${params.roomId}.m3u8?token=${token}&exp=${expiresAt.getTime()}`;

    return {
      playbackUrl: signedPlaybackUrl,
      isAllowed: true,
      token,
      expiresAt,
    };
  }

  verifyStreamWebhook(headers: Record<string, any>, payload: any): boolean {
    const signature = headers['x-stream-signature'];
    if (!signature) {
      return false;
    }
    const computed = crypto
      .createHmac('sha256', this.webhookSecret)
      .update(JSON.stringify(payload))
      .digest('hex');
    return signature === computed;
  }

  async endStream(roomId: string): Promise<boolean> {
    this.logger.log(`Requested media server to terminate stream for room ${roomId}`);
    return true;
  }
}
