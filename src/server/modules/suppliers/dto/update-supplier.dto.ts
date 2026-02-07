import {
  IsString,
  IsOptional,
  IsBoolean,
  IsArray,
  IsInt,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class UpdateSupplierDto {
  @ApiPropertyOptional({ example: 'Yetkazib beruvchi', description: 'Supplier name in Uzbek' })
  @IsOptional()
  @IsString()
  nameUz?: string;

  @ApiPropertyOptional({ example: 'Поставщик', description: 'Supplier name in Russian' })
  @IsOptional()
  @IsString()
  nameRu?: string;

  @ApiPropertyOptional({ example: '+998901234567', description: 'Phone number' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ example: 'Tashkent, Uzbekistan', description: 'Address' })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({ example: true, description: 'Active status' })
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @ApiPropertyOptional({ example: [1, 2], description: 'Category IDs' })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Type(() => Number)
  categoryIds?: number[];
}
