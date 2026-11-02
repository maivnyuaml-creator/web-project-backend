import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, IsBoolean, IsInt, Min, MaxLength } from 'class-validator';

export class UpdateCreatorProfileDto {
  @ApiPropertyOptional({ example: 'LadyVelora' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  stageName?: string;

  @ApiPropertyOptional({ example: 'Live everyday at 8 PM EST!' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  bio?: string;

  @ApiPropertyOptional({ example: 'https://cdn.velora.live/banner.jpg' })
  @IsOptional()
  @IsString()
  bannerUrl?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  tipMenuEnabled?: boolean;

  @ApiPropertyOptional({ example: 60 })
  @IsOptional()
  @IsInt()
  @Min(1)
  privateShowRatePerMinute?: number;

  @ApiPropertyOptional({ example: 30 })
  @IsOptional()
  @IsInt()
  @Min(1)
  groupShowRatePerMinute?: number;
}

export class CreateTipMenuItemDto {
  @ApiProperty({ example: 'Special Dance' })
  @IsString()
  label: string;

  @ApiProperty({ example: 100 })
  @IsInt()
  @Min(1)
  tokenPrice: number;

  @ApiPropertyOptional({ example: 'Performs a special custom dance routine' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  sortOrder?: number;
}
