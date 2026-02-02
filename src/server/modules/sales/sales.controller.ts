import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { SalesService } from './sales.service';
import { SyncSaleDto } from './dto/sync-sale.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('sales')
@UseGuards(JwtAuthGuard)
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  @Get()
  async findAll(
    @CurrentUser() user: any,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('cashierId') cashierId?: string,
  ) {
    const filters: any = {};

    if (startDate) filters.startDate = new Date(startDate);
    if (endDate) filters.endDate = new Date(endDate);

    // Non-admin users can only see their own sales
    if (user.role !== 'ADMIN') {
      filters.cashierId = user.id;
    } else if (cashierId) {
      filters.cashierId = cashierId;
    }

    return this.salesService.findAll(filters);
  }

  @Get(':id')
  async findOne(@CurrentUser() user: any, @Param('id') id: string) {
    return this.salesService.findById(id, user);
  }

  @Post('sync')
  async sync(@Body() syncSaleDto: SyncSaleDto) {
    return this.salesService.syncFromTerminal(syncSaleDto);
  }
}
