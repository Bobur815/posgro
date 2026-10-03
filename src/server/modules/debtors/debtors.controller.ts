import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
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

  /**
   * The store's ledger rows changed since a cursor — how a till learns what the other tills
   * wrote. Not @Roles-guarded, like sync-bulk: a cashier's till pulls it on every cycle.
   * Declared before `:id` so "ledger" is never read as a debtor id.
   */
  @Get('ledger/sync')
  @ApiOperation({ summary: 'Nasiya ledger rows changed since a cursor, for POS terminals' })
  @ApiQuery({ name: 'updatedAfter', required: false, type: String })
  @ApiQuery({ name: 'afterId', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async pullLedger(
    @CurrentStore() storeId: string,
    @Query('updatedAfter') updatedAfter?: string,
    @Query('afterId') afterId?: string,
    @Query('limit') limit?: string,
  ) {
    const after = updatedAfter ? new Date(updatedAfter) : undefined;
    if (after && Number.isNaN(after.getTime())) {
      throw new BadRequestException('updatedAfter must be an ISO date');
    }
    return this.debtors.pullLedger(
      storeId,
      { updatedAfter: after, afterId: afterId || undefined },
      limit ? Number(limit) || undefined : undefined,
    );
  }

  /** Read-only check to run before DEBT_BALANCE_FROM_LEDGER is switched on. */
  @Get('ledger/drift')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Debtors whose stored balance differs from their ledger sum' })
  async ledgerDrift(@CurrentStore() storeId: string) {
    return this.debtors.ledgerDrift(storeId);
  }

  /** Declared before `:id` so "payments" is never read as a debtor id. */
  @Get('payments')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Nasiya payments received in a period (read-only)' })
  @ApiQuery({ name: 'startDate', required: false, type: String })
  @ApiQuery({ name: 'endDate', required: false, type: String })
  async payments(
    @CurrentStore() storeId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const from = startDate ? new Date(startDate) : undefined;
    const to = endDate ? new Date(endDate) : undefined;
    if ((from && Number.isNaN(from.getTime())) || (to && Number.isNaN(to.getTime()))) {
      throw new BadRequestException('startDate and endDate must be ISO dates');
    }
    return this.debtors.paymentsInRange(storeId, { from, to });
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
