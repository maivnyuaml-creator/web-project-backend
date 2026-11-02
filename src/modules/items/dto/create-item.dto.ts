import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateItemDto {
  @ApiProperty({ example: 'Next.js & NestJS Fullstack Course', description: 'Item title or name' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiPropertyOptional({ example: 'Complete guide to building fullstack apps with NestJS and Next.js', description: 'Detailed item description' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ example: 49.99, description: 'Item price in USD' })
  @IsNumber()
  @Min(0)
  price: number;
}
