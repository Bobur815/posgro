import {
  IsString,
  IsNumber,
  IsInt,
  IsOptional,
  IsIn,
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

  @ApiPropertyOptional({ example: 10000, description: 'Purchase cost per unit' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  cost?: number;

  @ApiPropertyOptional({ example: 'clsupplier123', description: 'Supplier ID' })
  @IsOptional()
  @IsString()
  supplierId?: string;

  @ApiPropertyOptional({ example: 'Delivery note #123', description: 'Notes' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ example: 'CASH', description: 'Payment method (informational)' })
  @IsOptional()
  @IsString()
  paymentMethod?: string;

  @ApiPropertyOptional({ example: 'user-cuid', description: 'Created by user ID (informational)' })
  @IsOptional()
  @IsString()
  createdBy?: string;

  @ApiPropertyOptional({ example: 29000, description: 'New selling price to apply' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  newPrice?: number;

  @ApiPropertyOptional({ example: 'immediate', enum: ['immediate', 'deferred'], description: 'When to apply the new price' })
  @IsOptional()
  @IsIn(['immediate', 'deferred'])
  priceMode?: 'immediate' | 'deferred';

  @ApiPropertyOptional({ example: '2026-01-01', description: 'Production date (ISO string)' })
  @IsOptional()
  @IsString()
  productionDate?: string;

  @ApiPropertyOptional({ example: '2027-01-01', description: 'Expiry date (ISO string)' })
  @IsOptional()
  @IsString()
  expiryDate?: string;
}
