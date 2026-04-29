import {
  Controller,
  Get,
  Post,
  Patch,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { StoresService } from './stores.service';
import { CreateStoreDto } from './dto/create-store.dto';
import { UpdateStoreDto } from './dto/update-store.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';

@ApiTags('stores')
@Controller('stores')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN)
@ApiBearerAuth('JWT-auth')
export class StoresController {
  constructor(private readonly storesService: StoresService) {}

  @Get()
  @ApiOperation({ summary: 'Get all stores (Super Admin only)' })
  @ApiResponse({ status: 200, description: 'List of stores' })
  async findAll() {
    return this.storesService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get store by ID (Super Admin only)' })
  @ApiParam({ name: 'id', description: 'Store ID', example: 'clxyz123' })
  @ApiResponse({ status: 200, description: 'Store details with counts' })
  @ApiResponse({ status: 404, description: 'Store not found' })
  async findOne(@Param('id') id: string) {
    return this.storesService.findById(id);
  }

  @Get(':id/stats')
  @ApiOperation({ summary: 'Get store statistics (Super Admin only)' })
  @ApiParam({ name: 'id', description: 'Store ID', example: 'clxyz123' })
  @ApiResponse({ status: 200, description: 'Store with revenue, sales count, products and users' })
  @ApiResponse({ status: 404, description: 'Store not found' })
  async getStats(@Param('id') id: string) {
    return this.storesService.getStats(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create new store (Super Admin only)' })
  @ApiResponse({ status: 201, description: 'Store created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  async create(@Body() createStoreDto: CreateStoreDto) {
    return this.storesService.create(createStoreDto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update store (Super Admin only)' })
  @ApiParam({ name: 'id', description: 'Store ID', example: 'clxyz123' })
  @ApiResponse({ status: 200, description: 'Store updated successfully' })
  @ApiResponse({ status: 404, description: 'Store not found' })
  async update(@Param('id') id: string, @Body() updateStoreDto: UpdateStoreDto) {
    return this.storesService.update(id, updateStoreDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete store (Super Admin only)' })
  @ApiParam({ name: 'id', description: 'Store ID' })
  @ApiResponse({ status: 200, description: 'Store deleted successfully' })
  @ApiResponse({ status: 404, description: 'Store not found' })
  async remove(@Param('id') id: string) {
    return this.storesService.delete(id);
  }

  @Put(':id/cancel-delete')
  @ApiOperation({ summary: 'Cancel scheduled deletion and reactivate store (Super Admin only)' })
  @ApiParam({ name: 'id', description: 'Store ID' })
  @ApiResponse({ status: 200, description: 'Deletion cancelled, store reactivated' })
  async cancelDelete(@Param('id') id: string) {
    return this.storesService.cancelDelete(id);
  }

  @Post('purge-expired')
  @ApiOperation({ summary: 'Permanently delete all stores past their 30-day grace period (Super Admin only)' })
  @ApiResponse({ status: 200, description: 'Returns number of purged stores' })
  async purgeExpired() {
    return this.storesService.purgeExpired();
  }

  @Put(':id/activate')
  @ApiOperation({ summary: 'Activate store (Super Admin only)' })
  @ApiParam({ name: 'id', description: 'Store ID', example: 'clxyz123' })
  @ApiResponse({ status: 200, description: 'Store activated successfully' })
  @ApiResponse({ status: 404, description: 'Store not found' })
  async activate(@Param('id') id: string) {
    return this.storesService.activate(id);
  }

  @Put(':id/deactivate')
  @ApiOperation({ summary: 'Deactivate store (Super Admin only)' })
  @ApiParam({ name: 'id', description: 'Store ID', example: 'clxyz123' })
  @ApiResponse({ status: 200, description: 'Store deactivated successfully' })
  @ApiResponse({ status: 404, description: 'Store not found' })
  async deactivate(@Param('id') id: string) {
    return this.storesService.deactivate(id);
  }

  @Post(':id/credits')
  @ApiOperation({ summary: 'Add AI credit balance to a store (Super Admin only)' })
  @ApiParam({ name: 'id', description: 'Store ID' })
  @ApiResponse({ status: 201, description: 'Credits added, returns new balance' })
  async addCredits(@Param('id') id: string, @Body() body: { amount: number }) {
    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('amount must be a positive number');
    }
    return this.storesService.addCredits(id, amount);
  }
}
