import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * A product REGOS:VCR rejected on a receipt line, as a till reports it.
 *
 * Keyed on barcode, like every till→VPS product payload — never the till's local product id.
 */
export class InvalidProductReportDto {
  @ApiProperty({ example: '4780047860466' })
  @IsString()
  @IsNotEmpty()
  barcode!: string;

  @ApiProperty({
    example: '2026-10-05T10:30:00.000Z',
    description: 'When the till saw the rejection',
  })
  @IsDateString()
  at!: string;

  @ApiPropertyOptional({ example: 701003, description: 'REGOS error code' })
  @IsOptional()
  @IsInt()
  code?: number;
}

export class ReportInvalidProductsDto {
  @ApiProperty({ type: [InvalidProductReportDto] })
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => InvalidProductReportDto)
  items!: InvalidProductReportDto[];
}
