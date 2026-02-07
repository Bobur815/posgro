import {
  IsString,
  IsNumber,
  IsOptional,
  IsBoolean,
  IsInt,
  IsIn,
  Min,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ProductUnit } from '../../../../shared/types/product.types';

const PRODUCT_UNITS: ProductUnit[] = ['шт', 'кг', 'л', 'м'];

export class UpdateProductDto {
  @ApiPropertyOptional({ example: '4780001234567', description: 'Product barcode' })
  @IsOptional()
  @IsString()
  barcode?: string;

  @ApiPropertyOptional({ example: 'Coca-Cola 1.5L', description: 'Product name in Uzbek' })
  @IsOptional()
  @IsString()
  nameUz?: string;

  @ApiPropertyOptional({ example: 'Кока-Кола 1.5Л', description: 'Product name in Russian' })
  @IsOptional()
  @IsString()
  nameRu?: string;

  @ApiPropertyOptional({ example: 15000, description: 'Selling price' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  price?: number;

  @ApiPropertyOptional({ example: 12000, description: 'Purchase cost' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  cost?: number;

  @ApiPropertyOptional({ example: 50, description: 'Current stock quantity' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  stock?: number;

  @ApiPropertyOptional({ example: 5, description: 'Minimum stock alert level' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  minStock?: number;

  @ApiPropertyOptional({ example: 'кг', description: 'Unit of measurement (шт, кг, л, м)' })
  @IsOptional()
  @IsIn(PRODUCT_UNITS)
  unit?: ProductUnit;

  @ApiPropertyOptional({ example: 2, description: 'Category ID' })
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  categoryId?: number;

  @ApiPropertyOptional({ example: true, description: 'Active status' })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
