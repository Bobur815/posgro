import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsArray,
  ValidateNested,
  IsOptional,
  IsDateString,
} from 'class-validator';
import { Type } from 'class-transformer';

class SyncSaleItemDto {
  @IsString()
  @IsNotEmpty()
  id: string;

  @IsString()
  @IsNotEmpty()
  productId: string;

  @IsString()
  @IsNotEmpty()
  productName: string;

  @IsString()
  @IsNotEmpty()
  barcode: string;

  @IsString()
  @IsNotEmpty()
  quantity: string;

  @IsString()
  @IsNotEmpty()
  unitPrice: string;

  @IsString()
  @IsNotEmpty()
  subtotal: string;
}

export class SyncSaleDto {
  @IsString()
  @IsNotEmpty()
  id: string;

  @IsString()
  @IsNotEmpty()
  receiptNumber: string;

  @IsString()
  @IsNotEmpty()
  totalAmount: string;

  @IsOptional()
  @IsString()
  discountAmount?: string;

  @IsString()
  @IsNotEmpty()
  finalAmount: string;

  @IsString()
  @IsNotEmpty()
  paymentMethod: string;

  @IsString()
  @IsNotEmpty()
  cashierId: string;

  @IsString()
  @IsNotEmpty()
  cashierName: string;

  @IsString()
  @IsNotEmpty()
  terminalId: string;

  @IsDateString()
  createdAt: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SyncSaleItemDto)
  items: SyncSaleItemDto[];
}
