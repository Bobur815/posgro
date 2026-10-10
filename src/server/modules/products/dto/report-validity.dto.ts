import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * What a till learned about a product from REGOS:VCR: a receipt line rejected (`valid: false`) or
 * a receipt with it fiscalised (`valid: true`).
 *
 * Keyed on barcode, like every till→VPS product payload — never the till's local product id.
 */
export class ProductValidityReportDto {
  @ApiProperty({ example: '4780047860466' })
  @IsString()
  @IsNotEmpty()
  barcode!: string;

  @ApiProperty({
    example: '2026-10-09T10:30:00.000Z',
    description: 'When the till saw the outcome',
  })
  @IsDateString()
  at!: string;

  @ApiProperty({ example: false, description: 'false = rejected by REGOS, true = fiscalised' })
  @IsBoolean()
  valid!: boolean;

  @ApiPropertyOptional({ example: 701003, description: 'REGOS error code, for a rejection' })
  @IsOptional()
  @IsInt()
  code?: number;
}

export class ReportProductValidityDto {
  @ApiProperty({ type: [ProductValidityReportDto] })
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => ProductValidityReportDto)
  items!: ProductValidityReportDto[];
}
