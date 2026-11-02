import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsOptional } from 'class-validator';

export class CreateCheckoutDto {
  @ApiProperty({ example: 'package-uuid-123' })
  @IsString()
  @IsNotEmpty()
  packageId: string;

  @ApiProperty({ example: 'idem_key_payment_12345' })
  @IsString()
  @IsNotEmpty()
  idempotencyKey: string;

  @ApiPropertyOptional({ example: 'https://velora.live/wallet/success' })
  @IsOptional()
  @IsString()
  returnUrl?: string;
}

export class SandboxCheckoutCompleteDto {
  @ApiProperty({ example: 'sbx_sess_abc123' })
  @IsString()
  @IsNotEmpty()
  session: string;

  @ApiProperty({ example: 'package-uuid-123' })
  @IsString()
  @IsNotEmpty()
  pkg: string;

  @ApiProperty({ example: 'idem_key_payment_12345' })
  @IsString()
  @IsNotEmpty()
  idem: string;
}
