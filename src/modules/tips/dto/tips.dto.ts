import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsOptional, IsInt, Min, IsBoolean, MaxLength } from 'class-validator';

export class SendTipDto {
  @ApiProperty({ example: 'room-uuid-123' })
  @IsString()
  @IsNotEmpty()
  roomId: string;

  @ApiPropertyOptional({ example: 'menu-item-uuid-456' })
  @IsOptional()
  @IsString()
  tipMenuItemId?: string;

  @ApiPropertyOptional({ example: 50, description: 'Direct token amount if not selecting a tip menu item' })
  @IsOptional()
  @IsInt()
  @Min(1)
  customTokenAmount?: number;

  @ApiPropertyOptional({ example: 'You look amazing today!' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  message?: string;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  isAnonymous?: boolean;

  @ApiProperty({ example: 'tip_idem_key_abcdef123456' })
  @IsString()
  @IsNotEmpty()
  idempotencyKey: string;
}
