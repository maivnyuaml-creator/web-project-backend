import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { S3StorageProvider } from '../../providers/storage/s3-storage.provider';
import { AuditService } from '../audit/audit.service';
import { MediaType, AccessLevel } from '@prisma/client';
import { UploadMediaDto } from './dto/media.dto';
import * as crypto from 'crypto';

@Injectable()
export class MediaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storageProvider: S3StorageProvider,
    private readonly auditService: AuditService,
  ) {}

  async uploadMedia(userId: string, dto: UploadMediaDto, fileBuffer?: Buffer, mimeType = 'image/jpeg') {
    let buffer = fileBuffer;
    if (!buffer && dto.base64Data) {
      const match = dto.base64Data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
      if (match) {
        mimeType = match[1];
        buffer = Buffer.from(match[2], 'base64');
      } else {
        buffer = Buffer.from(dto.base64Data, 'base64');
      }
    }

    if (!buffer) {
      throw new BadRequestException('No file content or base64Data provided');
    }

    // Safety checks: allow only approved image/video MIME types
    const allowedMime = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];
    if (!allowedMime.includes(mimeType)) {
      throw new BadRequestException(`Unsupported media type: ${mimeType}`);
    }

    const ext = mimeType.split('/')[1] || 'bin';
    const storageKey = `${dto.type.toLowerCase()}/${userId}/${crypto.randomBytes(16).toString('hex')}.${ext}`;
    const isProtected = dto.type === MediaType.VERIFICATION_DOC || dto.accessLevel === AccessLevel.ADMIN_ONLY;

    const uploaded = await this.storageProvider.uploadFile({
      key: storageKey,
      buffer,
      mimeType,
      isProtected,
    });

    const mediaAsset = await this.prisma.mediaAsset.create({
      data: {
        ownerId: userId,
        type: dto.type,
        storageKey,
        bucket: uploaded.bucket,
        mimeType,
        sizeBytes: buffer.length,
        isApproved: !isProtected, // Public avatars/banners default approved, verification docs require review
        isProtected,
        accessLevel: dto.accessLevel || (isProtected ? AccessLevel.PRIVATE : AccessLevel.PUBLIC),
      },
    });

    await this.auditService.log({
      actorId: userId,
      action: 'MEDIA_UPLOADED',
      entityType: 'MediaAsset',
      entityId: mediaAsset.id,
      description: `Uploaded media ${dto.type} (${buffer.length} bytes)`,
    });

    return {
      mediaAsset,
      url: uploaded.url,
    };
  }

  async getMediaUrl(mediaId: string, requestingUserId?: string, isAdmin = false) {
    const asset = await this.prisma.mediaAsset.findUnique({
      where: { id: mediaId },
    });

    if (!asset) throw new NotFoundException('Media asset not found');

    if (asset.isProtected && asset.ownerId !== requestingUserId && !isAdmin) {
      throw new ForbiddenException('Access to protected media is restricted');
    }

    const downloadUrl = await this.storageProvider.getSignedDownloadUrl(
      asset.storageKey,
      asset.isProtected,
      900, // 15 mins
    );

    return {
      assetId: asset.id,
      url: downloadUrl,
      isProtected: asset.isProtected,
      mimeType: asset.mimeType,
    };
  }
}
