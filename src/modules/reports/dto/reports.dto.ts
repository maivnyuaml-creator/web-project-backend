import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsEnum, IsOptional, MaxLength } from 'class-validator';
import { ReportTargetType, ModerationActionType } from '@prisma/client';

export class CreateReportDto {
  @ApiProperty({ enum: ReportTargetType, example: ReportTargetType.ROOM })
  @IsEnum(ReportTargetType)
  targetType: ReportTargetType;

  @ApiProperty({ example: 'target-uuid-123' })
  @IsString()
  @IsNotEmpty()
  targetId: string;

  @ApiProperty({ example: 'Inappropriate content / Harassment' })
  @IsString()
  @IsNotEmpty()
  reason: string;

  @ApiPropertyOptional({ example: 'Specific details about the rule violation' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;
}

export class TakeModerationActionDto {
  @ApiProperty({ enum: ModerationActionType, example: ModerationActionType.WARN })
  @IsEnum(ModerationActionType)
  actionType: ModerationActionType;

  @ApiProperty({ example: 'target-user-uuid' })
  @IsString()
  @IsNotEmpty()
  targetUserId: string;

  @ApiProperty({ example: 'Violation of platform community standards' })
  @IsString()
  @IsNotEmpty()
  reason: string;

  @ApiPropertyOptional({ example: 60, description: 'Duration in minutes for temporary bans/mutes' })
  @IsOptional()
  durationMinutes?: number;

  @ApiPropertyOptional({ example: 'Resolved: warning issued to target user' })
  @IsOptional()
  @IsString()
  resolutionNotes?: string;
}
