import { Controller, Get, Patch, Param, Body, UseGuards } from '@nestjs/common';
import { PaynetService } from './paynet.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { StoreGuard } from '../../common/guards/store.guard';
import { CurrentStore } from '../../common/decorators/current-store.decorator';

@Controller('paynet-receipts')
@UseGuards(JwtAuthGuard, StoreGuard)
export class PaynetController {
  constructor(private readonly paynetService: PaynetService) {}

  @Get()
  getUnintegrated(@CurrentStore() storeId: string) {
    return this.paynetService.getUnintegrated(storeId);
  }

  @Patch(':id/integrate')
  integrate(
    @Param('id') id: string,
    @CurrentStore() storeId: string,
    @Body('saleReceiptNumber') saleReceiptNumber: string,
  ) {
    return this.paynetService.integrate(id, storeId, saleReceiptNumber);
  }
}
