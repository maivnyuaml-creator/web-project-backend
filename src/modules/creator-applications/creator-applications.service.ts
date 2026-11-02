import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ApplicationStatus, Role } from '@prisma/client';
import { CreateCreatorApplicationDto, ReviewApplicationDto } from './dto/creator-application.dto';

@Injectable()
export class CreatorApplicationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async createApplication(userId: string, dto: CreateCreatorApplicationDto) {
    const birthDate = new Date(dto.dateOfBirth);
    const ageDiffMs = Date.now() - birthDate.getTime();
    const ageDate = new Date(ageDiffMs);
    const calculatedAge = Math.abs(ageDate.getUTCFullYear() - 1970);

    if (calculatedAge < 18) {
      throw new BadRequestException('All platform creators must be at least 18 years of age');
    }

    const existing = await this.prisma.creatorApplication.findUnique({
      where: { userId },
    });

    if (existing && existing.status === ApplicationStatus.APPROVED) {
      throw new ConflictException('You are already an approved verified creator');
    }

    if (existing && existing.status === ApplicationStatus.PENDING) {
      throw new ConflictException('You already have a pending creator application under review');
    }

    const application = await this.prisma.$transaction(async (tx) => {
      const app = await tx.creatorApplication.upsert({
        where: { userId },
        update: {
          legalFirstName: dto.legalFirstName,
          legalLastName: dto.legalLastName,
          dateOfBirth: birthDate,
          country: dto.country,
          idDocumentType: dto.idDocumentType,
          idDocumentNumber: dto.idDocumentNumber,
          status: ApplicationStatus.PENDING,
          reviewerNotes: null,
          reviewedAt: null,
        },
        create: {
          userId,
          legalFirstName: dto.legalFirstName,
          legalLastName: dto.legalLastName,
          dateOfBirth: birthDate,
          country: dto.country,
          idDocumentType: dto.idDocumentType,
          idDocumentNumber: dto.idDocumentNumber,
          status: ApplicationStatus.PENDING,
        },
      });

      // Assign CREATOR_APPLICANT role
      await tx.userRole.upsert({
        where: { userId_role: { userId, role: Role.CREATOR_APPLICANT } },
        update: {},
        create: { userId, role: Role.CREATOR_APPLICANT },
      });

      // Prepare initial creator profile
      await tx.creatorProfile.upsert({
        where: { userId },
        update: {
          stageName: dto.stageName,
          bio: dto.bio,
        },
        create: {
          userId,
          stageName: dto.stageName,
          bio: dto.bio,
          isApproved: false,
        },
      });

      return app;
    });

    await this.auditService.log({
      actorId: userId,
      action: 'CREATOR_APPLICATION_SUBMITTED',
      entityType: 'CreatorApplication',
      entityId: application.id,
      description: `Creator application submitted for legal name ${dto.legalFirstName} ${dto.legalLastName}`,
    });

    return application;
  }

  async getMyApplication(userId: string) {
    const app = await this.prisma.creatorApplication.findUnique({
      where: { userId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            username: true,
            creatorProfile: true,
          },
        },
      },
    });

    if (!app) {
      throw new NotFoundException('No creator application found for current user');
    }

    return app;
  }

  async listApplications(status?: ApplicationStatus) {
    return this.prisma.creatorApplication.findMany({
      where: status ? { status } : undefined,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            username: true,
            displayName: true,
            createdAt: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async approveApplication(applicationId: string, reviewerId: string, dto: ReviewApplicationDto) {
    const application = await this.prisma.creatorApplication.findUnique({
      where: { id: applicationId },
      include: { user: true },
    });

    if (!application) {
      throw new NotFoundException('Creator application not found');
    }

    await this.prisma.$transaction(async (tx) => {
      // 1. Update application status
      await tx.creatorApplication.update({
        where: { id: applicationId },
        data: {
          status: ApplicationStatus.APPROVED,
          reviewedByUserId: reviewerId,
          reviewerNotes: dto.notes,
          reviewedAt: new Date(),
        },
      });

      // 2. Grant VERIFIED_CREATOR role
      await tx.userRole.upsert({
        where: { userId_role: { userId: application.userId, role: Role.VERIFIED_CREATOR } },
        update: {},
        create: { userId: application.userId, role: Role.VERIFIED_CREATOR },
      });

      // 3. Mark creator profile approved and populate tip menu if needed
      const profile = await tx.creatorProfile.upsert({
        where: { userId: application.userId },
        update: { isApproved: true },
        create: {
          userId: application.userId,
          stageName: application.user.displayName,
          isApproved: true,
        },
      });

      const existingItems = await tx.tipMenuItem.count({ where: { creatorId: profile.id } });
      if (existingItems === 0) {
        await tx.tipMenuItem.createMany({
          data: [
            { creatorId: profile.id, label: 'Say Hi / Wave', tokenPrice: 20, sortOrder: 1 },
            { creatorId: profile.id, label: 'Song Request', tokenPrice: 50, sortOrder: 2 },
            { creatorId: profile.id, label: 'Special Request', tokenPrice: 100, sortOrder: 3 },
          ],
        });
      }

      // 4. Create default stream room if none exists
      const existingRoom = await tx.streamRoom.findFirst({ where: { creatorId: application.userId } });
      if (!existingRoom) {
        await tx.streamRoom.create({
          data: {
            creatorId: application.userId,
            title: `${profile.stageName}'s Live Room`,
            topic: 'Welcome to my stream! Say hello in chat.',
            isLive: false,
          },
        });
      }
    });

    await this.auditService.log({
      actorId: reviewerId,
      action: 'CREATOR_APPLICATION_APPROVED',
      entityType: 'CreatorApplication',
      entityId: applicationId,
      description: `Creator application approved for user ${application.userId}`,
      newValue: { status: ApplicationStatus.APPROVED, notes: dto.notes },
    });

    return { success: true, message: 'Creator application approved successfully' };
  }

  async rejectApplication(applicationId: string, reviewerId: string, dto: ReviewApplicationDto) {
    const application = await this.prisma.creatorApplication.findUnique({
      where: { id: applicationId },
    });

    if (!application) {
      throw new NotFoundException('Creator application not found');
    }

    await this.prisma.creatorApplication.update({
      where: { id: applicationId },
      data: {
        status: ApplicationStatus.REJECTED,
        reviewedByUserId: reviewerId,
        reviewerNotes: dto.notes,
        reviewedAt: new Date(),
      },
    });

    await this.auditService.log({
      actorId: reviewerId,
      action: 'CREATOR_APPLICATION_REJECTED',
      entityType: 'CreatorApplication',
      entityId: applicationId,
      description: `Creator application rejected for user ${application.userId}. Reason: ${dto.notes}`,
      newValue: { status: ApplicationStatus.REJECTED, notes: dto.notes },
    });

    return { success: true, message: 'Creator application rejected' };
  }
}
