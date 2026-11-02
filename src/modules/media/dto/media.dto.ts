import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsEnum, IsOptional } from 'class-validator';
import { MediaType, AccessLevel } from '@prisma/client';

export class UploadMediaDto {
  @ApiProperty({ enum: MediaType, example: MediaType.AVATAR })
  @IsEnum(MediaType)
  type: MediaType;

  @ApiPropertyOptional({ enum: AccessLevel, example: AccessLevel.PUBLIC })
  @IsOptional()
  @IsEnum(AccessLevel)
  accessLevel?: AccessLevel;

  @ApiPropertyOptional({ example: 'data:image/png;base64,...' })
  @IsOptional()
  @IsString()
  base64Data?: string;
}
