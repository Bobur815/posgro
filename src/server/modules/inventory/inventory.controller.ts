import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
  HttpCode,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { InventoryService } from './inventory.service';
import { CreateArrivalDto } from './dto/create-arrival.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { StoreGuard } from '../../common/guards/store.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CurrentStore } from '../../common/decorators/current-store.decorator';
import { User } from '@prisma/client';
import { ArrivalFilters } from './types/inventory.types';

@ApiTags('inventory')
@Controller('inventory')
@UseGuards(JwtAuthGuard, StoreGuard, RolesGuard)
@Roles('ADMIN')
@ApiBearerAuth('JWT-auth')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get('arrivals')
  @ApiOperation({ summary: 'Get inventory arrivals (Admin only)' })
  @ApiQuery({ name: 'productId', required: false, type: Number })
  @ApiQuery({ name: 'startDate', required: false, type: String })
  @ApiResponse({ status: 200, description: 'List of arrivals' })
  async getArrivals(
    @CurrentStore() storeId: string,
    @Query('productId') productId?: string,
    @Query('startDate') startDate?: string,
  ) {
    const filters: ArrivalFilters = {};
    if (productId) filters.productId = parseInt(productId, 10);
    if (startDate) filters.startDate = new Date(startDate);

    return this.inventoryService.getArrivals(storeId, filters);
  }

  @Post('arrivals')
  @ApiOperation({ summary: 'Record inventory arrival (Admin only)' })
  @ApiResponse({ status: 201, description: 'Arrival recorded' })
  async createArrival(
    @CurrentStore() storeId: string,
    @Body() createArrivalDto: CreateArrivalDto,
    @CurrentUser() user: User,
  ) {
    return this.inventoryService.createArrival(storeId, createArrivalDto, user.id);
  }

  @Post('arrivals/sync-bulk')
  @HttpCode(200)
  @ApiOperation({ summary: 'Bulk sync inventory arrivals from POS terminal (Admin only)' })
  async syncBulkArrivals(@CurrentStore() storeId: string, @Body() body: { arrivals: any[] }) {
    return this.inventoryService.syncBulkArrivals(storeId, body.arrivals ?? []);
  }

  @Get('low-stock')
  @ApiOperation({ summary: 'Get low stock products (Admin only)' })
  @ApiResponse({ status: 200, description: 'List of low stock products' })
  async getLowStock(@CurrentStore() storeId: string) {
    return this.inventoryService.getLowStock(storeId);
  }
}
