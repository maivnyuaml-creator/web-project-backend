import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsDateString, IsOptional, MinLength } from 'class-validator';

export class CreateCreatorApplicationDto {
  @ApiProperty({ example: 'Jane' })
  @IsString()
  @IsNotEmpty()
  legalFirstName: string;

  @ApiProperty({ example: 'Doe' })
  @IsString()
  @IsNotEmpty()
  legalLastName: string;

  @ApiProperty({ example: '1998-04-20' })
  @IsDateString()
  dateOfBirth: string;

  @ApiProperty({ example: 'US' })
  @IsString()
  @IsNotEmpty()
  country: string;

  @ApiProperty({ example: 'PASSPORT' })
  @IsString()
  @IsNotEmpty()
  idDocumentType: string;

  @ApiProperty({ example: 'P123456789' })
  @IsString()
  @IsNotEmpty()
  idDocumentNumber: string;

  @ApiProperty({ example: 'LadyVelora' })
  @IsString()
  @MinLength(2)
  stageName: string;

  @ApiPropertyOptional({ example: 'I love cosplay and gaming streams' })
  @IsOptional()
  @IsString()
  bio?: string;
}

export class ReviewApplicationDto {
  @ApiPropertyOptional({ example: 'Compliant ID verified.' })
  @IsOptional()
  @IsString()
  notes?: string;
}
