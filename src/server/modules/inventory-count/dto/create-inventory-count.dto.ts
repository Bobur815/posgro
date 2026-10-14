import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { InventoryCountScope } from '@prisma/client';

export class CreateInventoryCountDto {
  @ApiPropertyOptional({
    enum: InventoryCountScope,
    example: 'FULL',
    description: 'FULL counts every active product; CATEGORY counts the chosen categories',
  })
  @IsOptional()
  @IsEnum(InventoryCountScope)
  scope?: InventoryCountScope;

  @ApiPropertyOptional({
    example: 3,
    description: 'One category for CATEGORY scope. Kept for older clients; merged with categoryIds',
  })
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  categoryId?: number;

  @ApiPropertyOptional({
    type: [Number],
    example: [3, 7],
    description: 'Categories for CATEGORY scope. With categoryId, the document covers both',
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(500)
  @IsInt({ each: true })
  @Type(() => Number)
  categoryIds?: number[];

  @ApiPropertyOptional({ example: 'Oylik inventarizatsiya', description: 'Free-text note' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
