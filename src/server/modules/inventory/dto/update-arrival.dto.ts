import { IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class UpdateArrivalDto {
  @ApiPropertyOptional({ example: 50, description: 'New quantity (adjusts product stock by delta)' })
  @IsOptional()
  @IsNumber()
  @Min(0.001)
  @Type(() => Number)
  quantity?: number;

  @ApiPropertyOptional({ example: 12000, description: 'Cost per unit' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  cost?: number;

  @ApiPropertyOptional({ example: 'Updated note' })
  @IsOptional()
  @IsString()
  notes?: string;
}
