import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsEnum, IsOptional } from 'class-validator';
import { ShowType } from '@prisma/client';

export class RequestShowDto {
  @ApiProperty({ example: 'room-uuid-123' })
  @IsString()
  @IsNotEmpty()
  roomId: string;

  @ApiProperty({ enum: ShowType, example: ShowType.PRIVATE })
  @IsEnum(ShowType)
  type: ShowType;
}

export class EndShowDto {
  @ApiPropertyOptional({ example: 'Session completed normally' })
  @IsOptional()
  @IsString()
  reason?: string;
}
