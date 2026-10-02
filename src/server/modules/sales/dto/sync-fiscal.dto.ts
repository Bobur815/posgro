import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * A sale's fiscal state, reported by the till after the sale itself has synced.
 *
 * Keyed on (store, receiptNumber) like POST /sales/sync — never the till's local id, which can
 * change after a SQLite reset.
 */
export class SyncFiscalStatusDto {
  @ApiProperty({ example: 'T1-20261001-0042' })
  @IsString()
  @IsNotEmpty()
  receiptNumber!: string;

  @ApiProperty({ example: 'FISCALIZED' })
  @IsIn(['PENDING', 'FISCALIZED', 'FAILED', 'DISABLED', 'DEFERRED_DEBT'])
  fiscalStatus!: string;

  @ApiPropertyOptional({ example: '2026-10-01T10:30:00.000Z' })
  @IsOptional()
  @IsDateString()
  fiscalizedAt?: string | null;

  @ApiPropertyOptional({
    example: 'cash',
    description: 'Tender on the fiscal receipt',
  })
  @IsOptional()
  @IsString()
  fiscalTender?: string | null;
}

export class SyncFiscalBulkDto {
  @ApiProperty({ type: [SyncFiscalStatusDto] })
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => SyncFiscalStatusDto)
  sales!: SyncFiscalStatusDto[];
}
