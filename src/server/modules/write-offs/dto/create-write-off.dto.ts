import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export const WRITE_OFF_REASONS = ['EXPIRY', 'DAMAGE', 'OTHER'] as const;
export type WriteOffReason = (typeof WRITE_OFF_REASONS)[number];

export class WriteOffLineDto {
  @ApiProperty({ example: 42 })
  @IsInt()
  @Type(() => Number)
  productId!: number;

  @ApiProperty({ example: 2.5, description: 'How much leaves stock, in the product unit' })
  @IsNumber({ maxDecimalPlaces: 3 })
  @IsPositive()
  @Type(() => Number)
  quantity!: number;
}

export class CreateWriteOffDto {
  @ApiPropertyOptional({
    example: 'clwo123abc',
    description:
      'Client-generated id. A retry with the same id returns the document already written.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  id?: string;

  @ApiProperty({ enum: WRITE_OFF_REASONS, example: 'EXPIRY' })
  @IsIn(WRITE_OFF_REASONS)
  reason!: WriteOffReason;

  @ApiPropertyOptional({
    example: 'Muddati o‘tgan sut',
    description: 'Required when reason = OTHER',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @ApiProperty({ type: [WriteOffLineDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => WriteOffLineDto)
  items!: WriteOffLineDto[];
}
