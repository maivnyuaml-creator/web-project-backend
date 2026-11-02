import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsBoolean } from 'class-validator';

export class CreateVerificationSessionDto {
  @ApiProperty({ example: 'https://velora.live/verification/complete' })
  @IsString()
  @IsNotEmpty()
  returnUrl: string;
}

export class CompleteSandboxVerificationDto {
  @ApiProperty({ example: 'ident_sess_abc123' })
  @IsString()
  @IsNotEmpty()
  sessionId: string;

  @ApiProperty({ example: true })
  @IsBoolean()
  approve: boolean;
}
