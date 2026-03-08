import { Module } from '@nestjs/common';
import { InvoiceScannerController } from './invoice-scanner.controller';
import { InvoiceScannerService } from './invoice-scanner.service';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [InvoiceScannerController],
  providers: [InvoiceScannerService],
})
export class InvoiceScannerModule {}
