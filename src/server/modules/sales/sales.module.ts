import { Module } from '@nestjs/common';
import { SalesController } from './sales.controller';
import { SalesService } from './sales.service';
import { SalesFiscalService } from './sales-fiscal.service';
import { SalesPaymentsService } from './sales-payments.service';
import { ProductsModule } from '../products/products.module';

@Module({
  imports: [ProductsModule],
  controllers: [SalesController],
  providers: [SalesService, SalesFiscalService, SalesPaymentsService],
  exports: [SalesService],
})
export class SalesModule {}
