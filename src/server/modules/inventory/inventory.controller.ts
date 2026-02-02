import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { CreateArrivalDto } from './dto/create-arrival.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('inventory')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get('arrivals')
  async getArrivals(
    @Query('productId') productId?: string,
    @Query('startDate') startDate?: string,
  ) {
    const filters: any = {};
    if (productId) filters.productId = productId;
    if (startDate) filters.startDate = new Date(startDate);

    return this.inventoryService.getArrivals(filters);
  }

  @Post('arrivals')
  async createArrival(
    @Body() createArrivalDto: CreateArrivalDto,
    @CurrentUser() user: any,
  ) {
    return this.inventoryService.createArrival(createArrivalDto, user.id);
  }

  @Get('low-stock')
  async getLowStock() {
    return this.inventoryService.getLowStock();
  }
}
