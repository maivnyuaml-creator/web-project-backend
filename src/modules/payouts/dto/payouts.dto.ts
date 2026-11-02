import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsInt, Min, IsOptional } from 'class-validator';

export class RequestPayoutDto {
  @ApiProperty({ example: 10000, description: 'Amount to withdraw in minor units (e.g. 10000 = $100.00)' })
  @IsInt()
  @Min(5000, { message: 'Minimum payout threshold is $50.00 (5000 minor units)' })
  amountMinorUnits: number;

  @ApiPropertyOptional({ example: 'payout-account-uuid' })
  @IsOptional()
  @IsString()
  payoutAccountId?: string;

  @ApiPropertyOptional({ example: 'Standard bi-weekly payout' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class AddPayoutAccountDto {
  @ApiProperty({ example: 'BANK_WIRE' })
  @IsString()
  @IsNotEmpty()
  payoutMethod: string;

  @ApiProperty({ example: 'US12345678901234' })
  @IsString()
  @IsNotEmpty()
  accountReference: string;

  @ApiPropertyOptional({ example: 'USD' })
  @IsOptional()
  @IsString()
  currency?: string;
}
