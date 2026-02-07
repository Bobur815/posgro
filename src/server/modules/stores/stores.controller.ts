import {
  Controller,
  Get,
  Post,
  Patch,
  Put,
  Body,
  Param,
  UseGuards,
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
}
