import { Module } from '@nestjs/common';
import { InvoiceScannerController } from './invoice-scanner.controller';
import { InvoiceScannerService } from './invoice-scanner.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { BillingModule } from '../billing/billing.module';

@Module({
  imports: [PrismaModule, BillingModule],
  controllers: [InvoiceScannerController],
  providers: [InvoiceScannerService],
})
export class InvoiceScannerModule {}
