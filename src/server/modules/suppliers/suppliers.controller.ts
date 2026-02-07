import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { SuppliersService } from './suppliers.service';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { StoreGuard } from '../../common/guards/store.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentStore } from '../../common/decorators/current-store.decorator';
import { UserRole } from '@prisma/client';
import { SupplierFilters } from './types/supplier.types';

@ApiTags('suppliers')
@Controller('suppliers')
@UseGuards(JwtAuthGuard, StoreGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@ApiBearerAuth('JWT-auth')
export class SuppliersController {
  constructor(private readonly suppliersService: SuppliersService) {}

  @Get()
  @ApiOperation({ summary: 'Get all suppliers for the store (Admin only)' })
  @ApiQuery({ name: 'active', required: false, type: Boolean })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiResponse({ status: 200, description: 'List of suppliers' })
  async findAll(
    @CurrentStore() storeId: string,
    @Query('active') active?: string,
    @Query('search') search?: string,
  ) {
    const filters: SupplierFilters = {};

    if (active !== undefined) filters.active = active === 'true';
    if (search) filters.search = search;

    return this.suppliersService.findAll(storeId, filters);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get supplier by ID (Admin only)' })
  @ApiResponse({ status: 200, description: 'Supplier details' })
  @ApiResponse({ status: 404, description: 'Supplier not found' })
  async findOne(@CurrentStore() storeId: string, @Param('id') id: string) {
    return this.suppliersService.findById(id, storeId);
  }

  @Post()
  @ApiOperation({ summary: 'Create new supplier (Admin only)' })
  @ApiResponse({ status: 201, description: 'Supplier created' })
  async create(@CurrentStore() storeId: string, @Body() createSupplierDto: CreateSupplierDto) {
    return this.suppliersService.create(storeId, createSupplierDto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update supplier (Admin only)' })
  @ApiResponse({ status: 200, description: 'Supplier updated' })
  @ApiResponse({ status: 404, description: 'Supplier not found' })
  async update(
    @CurrentStore() storeId: string,
    @Param('id') id: string,
    @Body() updateSupplierDto: UpdateSupplierDto,
  ) {
    return this.suppliersService.update(id, storeId, updateSupplierDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete or deactivate supplier (Admin only)' })
  @ApiResponse({ status: 200, description: 'Supplier deleted/deactivated' })
  @ApiResponse({ status: 404, description: 'Supplier not found' })
  async remove(@CurrentStore() storeId: string, @Param('id') id: string) {
    return this.suppliersService.delete(id, storeId);
  }
}
