import {
  Controller,
  Get,
  Post,
  Patch,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
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
import { CurrentUser } from '../../common/decorators/current-user.decorator';
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
  @Roles(UserRole.ADMIN, UserRole.USER)
  @ApiOperation({ summary: 'Get all suppliers for the store' })
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

  @Post('sync-bulk')
  @HttpCode(200)
  @ApiOperation({ summary: 'Bulk upsert suppliers from POS terminal (Admin only)' })
  async syncBulk(@CurrentStore() storeId: string, @Body() body: { suppliers: any[] }) {
    return this.suppliersService.syncBulk(storeId, body.suppliers ?? []);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete or deactivate supplier (Admin only)' })
  @ApiResponse({ status: 200, description: 'Supplier deleted/deactivated' })
  @ApiResponse({ status: 404, description: 'Supplier not found' })
  async remove(@CurrentStore() storeId: string, @Param('id') id: string) {
    return this.suppliersService.delete(id, storeId);
  }

  // ── Supplier Transactions ─────────────────────────────────────

  @Get('transactions')
  @Roles(UserRole.ADMIN, UserRole.USER)
  @ApiOperation({ summary: 'Get supplier transactions' })
  @ApiQuery({ name: 'supplierId', required: false, type: String })
  @ApiQuery({ name: 'type', required: false, type: String })
  async getTransactions(
    @CurrentStore() storeId: string,
    @Query('supplierId') supplierId?: string,
    @Query('type') type?: string,
  ) {
    return this.suppliersService.getTransactions(storeId, { supplierId, type });
  }

  @Post('transactions')
  @ApiOperation({ summary: 'Create supplier transaction (Admin only)' })
  @ApiResponse({ status: 201, description: 'Transaction created' })
  async createTransaction(
    @CurrentStore() storeId: string,
    @CurrentUser('id') userId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.suppliersService.createTransaction(storeId, userId, body);
  }

  @Put('transactions/:txId')
  @ApiOperation({ summary: 'Update supplier transaction (Admin only)' })
  @ApiResponse({ status: 200, description: 'Transaction updated' })
  async updateTransaction(
    @CurrentStore() storeId: string,
    @Param('txId') txId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.suppliersService.updateTransaction(txId, storeId, body);
  }

  @Delete('transactions/:txId')
  @ApiOperation({ summary: 'Delete supplier transaction (Admin only)' })
  @ApiResponse({ status: 200, description: 'Transaction deleted' })
  async deleteTransaction(
    @CurrentStore() storeId: string,
    @Param('txId') txId: string,
  ) {
    return this.suppliersService.deleteTransaction(txId, storeId);
  }

  @Get(':id/balance')
  @Roles(UserRole.ADMIN, UserRole.USER)
  @ApiOperation({ summary: 'Get supplier balance' })
  async getBalance(@CurrentStore() storeId: string, @Param('id') id: string) {
    return this.suppliersService.getBalance(id, storeId);
  }

  @Post('payments')
  @ApiOperation({ summary: 'Record supplier payment (Admin only)' })
  @ApiResponse({ status: 201, description: 'Payment recorded' })
  async recordPayment(
    @CurrentStore() storeId: string,
    @CurrentUser('id') userId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.suppliersService.recordPayment(storeId, userId, body);
  }
}
