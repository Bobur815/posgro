import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsInt,
  IsIn,
  IsBoolean,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ProductUnit } from '../../../../shared/types/product.types';

const PRODUCT_UNITS: ProductUnit[] = ['шт', 'кг', 'л', 'м'];

export class CreateProductDto {
  @ApiProperty({ example: '4780001234567', description: 'Product barcode' })
  @IsString()
  @IsNotEmpty()
  barcode!: string;

  @ApiProperty({ example: 'Coca-Cola 1L', description: 'Product name in Uzbek' })
  @IsString()
  @IsNotEmpty()
  nameUz!: string;

  @ApiProperty({ example: 'Кока-Кола 1Л', description: 'Product name in Russian' })
  @IsString()
  @IsNotEmpty()
  nameRu!: string;

  @ApiProperty({ example: 12000, description: 'Selling price' })
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  price!: number;

  @ApiPropertyOptional({ example: 10000, description: 'Purchase cost (admin only)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  cost?: number;

  @ApiPropertyOptional({ example: 100, description: 'Current stock quantity' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  stock?: number;

  @ApiPropertyOptional({ example: 10, description: 'Minimum stock alert level' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  minStock?: number;

  @ApiPropertyOptional({ example: 'шт', description: 'Unit of measurement (шт, кг, л, м)' })
  @IsOptional()
  @IsIn(PRODUCT_UNITS)
  unit?: ProductUnit;

  @ApiProperty({ example: 1, description: 'Category ID' })
  @IsInt()
  @Type(() => Number)
  categoryId!: number;

  @ApiPropertyOptional({ example: 'supplier-cuid', description: 'Supplier ID' })
  @IsOptional()
  @IsString()
  supplierId?: string;

  @ApiPropertyOptional({ example: '2026-01-01', description: 'Production date (ISO string)' })
  @IsOptional()
  @IsString()
  productionDate?: string;

  @ApiPropertyOptional({ example: '2027-01-01', description: 'Expiry date (ISO string)' })
  @IsOptional()
  @IsString()
  expiryDate?: string;

  @ApiPropertyOptional({ example: 5, description: 'Discount percentage' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  discountPercent?: number;

  @ApiPropertyOptional({ example: false, description: 'Is on promotion' })
  @IsOptional()
  @IsBoolean()
  isOnPromotion?: boolean;

  @ApiPropertyOptional({ example: true, description: 'Active status' })
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @ApiPropertyOptional({ example: '00000000000000000', description: 'Uzbekistan national catalog code' })
  @IsOptional()
  @IsString()
  mxik?: string;
}
