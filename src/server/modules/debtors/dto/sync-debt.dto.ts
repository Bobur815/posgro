import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsIn,
  IsArray,
  IsDateString,
  IsBoolean,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * One nasiya ledger row as a terminal reports it.
 *
 * Money crosses as a string, like every other amount in this API: a JSON number would round the
 * som figures on the way in. The id is the till's own, so re-sending is an upsert.
 */
export class SyncDebtTransactionDto {
  @ApiProperty({ example: 'cldebt123', description: 'Terminal row id, reused as the PK' })
  @IsString()
  @IsNotEmpty()
  id!: string;

  @ApiProperty({ example: 'cluser123' })
  @IsString()
  @IsNotEmpty()
  userId!: string;

  @ApiProperty({ example: 'CHARGE', enum: ['CHARGE', 'PAYMENT', 'ADJUSTMENT'] })
  @IsIn(['CHARGE', 'PAYMENT', 'ADJUSTMENT'])
  type!: 'CHARGE' | 'PAYMENT' | 'ADJUSTMENT';

  @ApiProperty({ example: '70000', description: 'Signed: + owes more, − owes less' })
  @IsString()
  @IsNotEmpty()
  amount!: string;

  @ApiPropertyOptional({ example: 'CASH' })
  @IsOptional()
  @IsString()
  paymentMethod?: string | null;

  @ApiPropertyOptional({ example: 'clsale123', description: 'CHARGE rows: the credit sale' })
  @IsOptional()
  @IsString()
  saleId?: string | null;

  @ApiPropertyOptional({ description: 'CHARGE rows: when payments finished covering it' })
  @IsOptional()
  @IsDateString()
  settledAt?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dueDate?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string | null;

  @ApiProperty({ example: 'cluser123' })
  @IsString()
  @IsNotEmpty()
  createdBy!: string;

  @ApiProperty({ example: '2026-09-21T10:30:00.000Z' })
  @IsDateString()
  createdAt!: string;

  // Multi-till replication. All optional: terminals before it do not send them.

  @ApiPropertyOptional({ example: 'T1', description: 'Till that wrote the row' })
  @IsOptional()
  @IsString()
  originTerminalId?: string | null;

  @ApiPropertyOptional({ example: 'cash', description: 'CHARGE rows: tender that settled it' })
  @IsOptional()
  @IsString()
  settleTender?: string | null;

  @ApiPropertyOptional({ description: 'CHARGE rows: whether the settling till chose to fiscalize' })
  @IsOptional()
  @IsBoolean()
  settleFiscalize?: boolean | null;
}

export class SyncDebtBulkDto {
  @ApiProperty({ type: [SyncDebtTransactionDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SyncDebtTransactionDto)
  transactions!: SyncDebtTransactionDto[];
}
