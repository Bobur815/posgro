import { IsIn, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateTransactionDto {
  @ApiPropertyOptional({ enum: ['PAYMENT', 'RETURN', 'ADVANCE'] })
  @IsOptional()
  @IsIn(['PAYMENT', 'RETURN', 'ADVANCE'])
  type?: 'PAYMENT' | 'RETURN' | 'ADVANCE';

  @ApiPropertyOptional({ enum: ['CASH', 'CARD', 'BANK_TRANSFER'] })
  @IsOptional()
  @IsIn(['CASH', 'CARD', 'BANK_TRANSFER'])
  paymentMethod?: 'CASH' | 'CARD' | 'BANK_TRANSFER';

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0.01)
  @Type(() => Number)
  amount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;
}
