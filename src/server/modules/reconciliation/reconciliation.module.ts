import { Module } from '@nestjs/common';
import { ReconciliationController } from './reconciliation.controller';
import { ReconciliationService } from './reconciliation.service';
import { MoneyReconciliationService } from './money.service';
import { BankTurnoverService } from './bank.service';

@Module({
  controllers: [ReconciliationController],
  providers: [ReconciliationService, MoneyReconciliationService, BankTurnoverService],
  exports: [ReconciliationService, MoneyReconciliationService],
})
export class ReconciliationModule {}
