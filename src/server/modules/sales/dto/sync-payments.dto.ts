import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsString,
  Matches,
  ValidateNested,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/** One tender of a split-payment receipt. Cash is net of change. */
export class SalePaymentLineDto {
  @ApiProperty({ example: 'cash', enum: ['cash', 'card', 'uzqr', 'click'] })
  @IsIn(['cash', 'card', 'uzqr', 'click'])
  method!: string;

  @ApiProperty({ example: '55000.00', description: "Decimal string, so'm" })
  @IsString()
  @Matches(/^\d{1,8}(\.\d{1,2})?$/, { message: 'amount must be a positive decimal with ≤2 places' })
  amount!: string;
}

/**
 * The tenders of one split-payment receipt, reported by the till.
 *
 * Keyed on (store, receiptNumber) like POST /sales/sync. Sent on its own endpoint, never inside
 * /sales/sync: the server rejects unknown fields there, so an older server would refuse the sale.
 */
export class SyncSalePaymentsDto {
  @ApiProperty({ example: 'T1-20261002-0042' })
  @IsString()
  @IsNotEmpty()
  receiptNumber!: string;

  @ApiProperty({ type: [SalePaymentLineDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(4)
  @ValidateNested({ each: true })
  @Type(() => SalePaymentLineDto)
  payments!: SalePaymentLineDto[];
}

export class SyncSalePaymentsBulkDto {
  @ApiProperty({ type: [SyncSalePaymentsDto] })
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => SyncSalePaymentsDto)
  sales!: SyncSalePaymentsDto[];
}
