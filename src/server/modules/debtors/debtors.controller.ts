import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { DebtorsService } from './debtors.service';
import { SyncDebtBulkDto } from './dto/sync-debt.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { StoreGuard } from '../../common/guards/store.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentStore } from '../../common/decorators/current-store.decorator';

@ApiTags('debtors')
@Controller('debtors')
@UseGuards(JwtAuthGuard, StoreGuard)
@ApiBearerAuth('JWT-auth')
export class DebtorsController {
  constructor(private readonly debtors: DebtorsService) {}

  /**
   * Not @Roles-guarded, for the same reason the shift sync is not: it is a cashier's terminal
   * pushing its own ledger, and cashiers are USER role. StoreGuard pins it to its own store.
   */
  @Post('sync-bulk')
  @ApiOperation({ summary: 'Mirror nasiya ledger rows up from a POS terminal' })
  @ApiResponse({ status: 201, description: 'Rows synced' })
  async syncBulk(@CurrentStore() storeId: string, @Body() dto: SyncDebtBulkDto) {
    return this.debtors.syncFromTerminal(storeId, dto.transactions);
  }

  @Get()
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Who owes the store money (read-only)' })
  @ApiQuery({ name: 'withDebtOnly', required: false, type: Boolean })
  @ApiQuery({ name: 'search', required: false, type: String })
  async findAll(
    @CurrentStore() storeId: string,
    @Query('withDebtOnly') withDebtOnly?: string,
    @Query('search') search?: string,
  ) {
    return this.debtors.findAll(storeId, {
      // Query strings arrive as text; only an explicit "true" narrows the list.
      withDebtOnly: withDebtOnly === 'true',
      search,
    });
  }

  @Get(':id')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: "One debtor's balance, ledger and credit sales (read-only)" })
  async findOne(@CurrentStore() storeId: string, @Param('id') id: string) {
    return this.debtors.findOne(storeId, id);
  }
}
