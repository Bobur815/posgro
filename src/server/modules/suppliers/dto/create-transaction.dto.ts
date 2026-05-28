import { IsString, IsNotEmpty, IsIn, IsNumber, IsOptional, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const ALLOWED_TYPES = ['PAYMENT', 'RETURN', 'ADVANCE'] as const;
const ALLOWED_METHODS = ['CASH', 'CARD', 'BANK_TRANSFER'] as const;

export class CreateTransactionDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  supplierId!: string;

  @ApiProperty({ enum: ALLOWED_TYPES })
  @IsIn(ALLOWED_TYPES)
  type!: 'PAYMENT' | 'RETURN' | 'ADVANCE';

  @ApiProperty({ enum: ALLOWED_METHODS })
  @IsIn(ALLOWED_METHODS)
  paymentMethod!: 'CASH' | 'CARD' | 'BANK_TRANSFER';

  @ApiProperty({ example: 50000 })
  @IsNumber()
  @Min(0.01)
  @Type(() => Number)
  amount!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  referenceId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  referenceType?: string;
}
