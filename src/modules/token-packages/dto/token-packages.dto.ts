import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsInt, Min, IsOptional, IsBoolean } from 'class-validator';

export class CreateTokenPackageDto {
  @ApiProperty({ example: 'Starter Pack' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 100 })
  @IsInt()
  @Min(1)
  tokenAmount: number;

  @ApiPropertyOptional({ example: 10 })
  @IsOptional()
  @IsInt()
  @Min(0)
  bonusTokens?: number;

  @ApiProperty({ example: 999, description: 'Price in USD minor units (cents), e.g. 999 = $9.99' })
  @IsInt()
  @Min(1)
  priceMinorUnits: number;

  @ApiPropertyOptional({ example: 'USD' })
  @IsOptional()
  @IsString()
  currency?: string;
}

export class UpdateTokenPackageDto {
  @ApiPropertyOptional({ example: 'Starter Pack' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: 100 })
  @IsOptional()
  @IsInt()
  @Min(1)
  tokenAmount?: number;

  @ApiPropertyOptional({ example: 10 })
  @IsOptional()
  @IsInt()
  @Min(0)
  bonusTokens?: number;

  @ApiPropertyOptional({ example: 999 })
  @IsOptional()
  @IsInt()
  @Min(1)
  priceMinorUnits?: number;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
