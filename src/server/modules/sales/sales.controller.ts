import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { SalesService } from './sales.service';
import { SyncSaleDto } from './dto/sync-sale.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { StoreGuard } from '../../common/guards/store.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CurrentStore } from '../../common/decorators/current-store.decorator';
import { User, UserRole } from '@prisma/client';
import { SaleFilters } from './types/sale.types';

@ApiTags('sales')
@Controller('sales')
@UseGuards(JwtAuthGuard, StoreGuard)
@ApiBearerAuth('JWT-auth')
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  @Get()
  @ApiOperation({ summary: 'Get sales list (filtered by role)' })
  @ApiQuery({ name: 'startDate', required: false, type: String })
  @ApiQuery({ name: 'endDate', required: false, type: String })
  @ApiQuery({ name: 'cashierId', required: false, type: String })
  @ApiResponse({ status: 200, description: 'List of sales' })
  async findAll(
    @CurrentStore() storeId: string,
    @CurrentUser() user: User,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('cashierId') cashierId?: string,
  ) {
    const filters: SaleFilters = {};

    if (startDate) filters.startDate = new Date(startDate);
    if (endDate) filters.endDate = new Date(endDate);

    // Non-admin users can only see their own sales
    if (user.role !== UserRole.ADMIN && user.role !== UserRole.SUPER_ADMIN) {
      filters.cashierId = user.id;
    } else if (cashierId) {
      filters.cashierId = cashierId;
    }

    return this.salesService.findAll(storeId, filters);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get sale by ID' })
  @ApiResponse({ status: 200, description: 'Sale details' })
  @ApiResponse({ status: 404, description: 'Sale not found' })
  @ApiResponse({ status: 403, description: 'Access denied' })
  async findOne(
    @CurrentStore() storeId: string,
    @CurrentUser() user: User,
    @Param('id') id: string,
  ) {
    return this.salesService.findById(id, storeId, user);
  }

  @Post('sync')
  @ApiOperation({ summary: 'Sync sale from POS terminal' })
  @ApiResponse({ status: 201, description: 'Sale synced successfully' })
  @ApiResponse({ status: 200, description: 'Sale already synced' })
  async sync(@CurrentStore() storeId: string, @Body() syncSaleDto: SyncSaleDto) {
    return this.salesService.syncFromTerminal(storeId, syncSaleDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete sale and restore stock (terminal return flow)' })
  @ApiResponse({ status: 200, description: 'Sale deleted and stock restored' })
  @ApiResponse({ status: 404, description: 'Sale not found' })
  @ApiResponse({ status: 403, description: 'Can only delete own sales' })
  async remove(
    @CurrentStore() storeId: string,
    @CurrentUser() user: User,
    @Param('id') id: string,
  ) {
    return this.salesService.deleteById(id, storeId, user);
  }

  @Post('unbackfill-stock')
  @ApiOperation({ summary: 'One-time: undo the backfill double-decrement (ADMIN only)' })
  async unbackfillStock(
    @CurrentStore() storeId: string,
    @CurrentUser() user: User,
  ) {
    if (user.role !== UserRole.ADMIN && user.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('ADMIN only');
    }
    return this.salesService.unbackfillStock(storeId);
  }
}
