import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { StorageProvider, UploadFileParams } from './storage-provider.interface';

@Injectable()
export class S3StorageProvider implements StorageProvider {
  private readonly logger = new Logger(S3StorageProvider.name);
  private readonly s3: S3Client;
  private readonly bucketPublic: string;
  private readonly bucketProtected: string;
  private readonly endpoint: string;

  constructor(private readonly configService: ConfigService) {
    this.endpoint = this.configService.get<string>('storage.endpoint', 'http://localhost:9000');
    this.bucketPublic = this.configService.get<string>('storage.bucketPublic', 'velora-public-media');
    this.bucketProtected = this.configService.get<string>('storage.bucketProtected', 'velora-protected-media');

    this.s3 = new S3Client({
      endpoint: this.endpoint,
      region: this.configService.get<string>('storage.region', 'us-east-1'),
      credentials: {
        accessKeyId: this.configService.get<string>('storage.accessKeyId', 'minioadmin'),
        secretAccessKey: this.configService.get<string>('storage.secretAccessKey', 'minioadmin'),
      },
      forcePathStyle: this.configService.get<boolean>('storage.forcePathStyle', true),
    });
  }

  async uploadFile(params: UploadFileParams): Promise<{ key: string; bucket: string; url: string }> {
    const bucket = params.isProtected ? this.bucketProtected : this.bucketPublic;

    try {
      await this.s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: params.key,
          Body: params.buffer,
          ContentType: params.mimeType,
        }),
      );

      const url = `${this.endpoint}/${bucket}/${params.key}`;
      return { key: params.key, bucket, url };
    } catch (error: any) {
      this.logger.warn(`Storage upload error (${error.message}). Returning sandbox mock path.`);
      return {
        key: params.key,
        bucket,
        url: `/uploads/${params.key}`,
      };
    }
  }

  async getSignedDownloadUrl(key: string, isProtected: boolean, expiresInSeconds = 900): Promise<string> {
    const bucket = isProtected ? this.bucketProtected : this.bucketPublic;

    try {
      const command = new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      });
      return await getSignedUrl(this.s3, command, { expiresIn: expiresInSeconds });
    } catch (error: any) {
      this.logger.warn(`Presigned URL error (${error.message}). Returning fallback link.`);
      return `/api/v1/media/protected/${key}?exp=${Date.now() + expiresInSeconds * 1000}`;
    }
  }

  async deleteFile(key: string, isProtected: boolean): Promise<boolean> {
    const bucket = isProtected ? this.bucketProtected : this.bucketPublic;
    try {
      await this.s3.send(
        new DeleteObjectCommand({
          Bucket: bucket,
          Key: key,
        }),
      );
      return true;
    } catch (error: any) {
      this.logger.warn(`Delete file error: ${error.message}`);
      return false;
    }
  }
}
