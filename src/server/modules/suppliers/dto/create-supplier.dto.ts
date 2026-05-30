import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsArray,
  IsInt,
  IsNumber,
  IsIn,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateSupplierDto {
  @ApiProperty({ example: 'Yetkazib beruvchi', description: 'Supplier name in Uzbek' })
  @IsString()
  @IsNotEmpty()
  nameUz!: string;

  @ApiProperty({ example: 'Поставщик', description: 'Supplier name in Russian' })
  @IsString()
  @IsNotEmpty()
  nameRu!: string;

  @ApiPropertyOptional({ example: '+998901234567', description: 'Phone number' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ example: 'Tashkent, Uzbekistan', description: 'Address' })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({ example: 0, description: 'Initial balance' })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  balance?: number;

  @ApiPropertyOptional({ example: 'IMMEDIATE', enum: ['IMMEDIATE', 'INSTALLMENT'] })
  @IsOptional()
  @IsString()
  @IsIn(['IMMEDIATE', 'INSTALLMENT'])
  paymentType?: string;

  @ApiPropertyOptional({ example: [1, 2], description: 'Category IDs' })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Type(() => Number)
  categoryIds?: number[];
}
