import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsInt,
  IsOptional,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateArrivalDto {
  @ApiProperty({ example: 1, description: 'Product ID' })
  @IsInt()
  @Type(() => Number)
  productId!: number;

  @ApiProperty({ example: 100, description: 'Quantity received' })
  @IsNumber()
  @Min(0.001)
  @Type(() => Number)
  quantity!: number;

  @ApiProperty({ example: 10000, description: 'Purchase cost per unit' })
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  cost!: number;

  @ApiPropertyOptional({ example: 'clsupplier123', description: 'Supplier ID' })
  @IsOptional()
  @IsString()
  supplierId?: string;

  @ApiPropertyOptional({ example: 'Delivery note #123', description: 'Notes' })
  @IsOptional()
  @IsString()
  notes?: string;
}
