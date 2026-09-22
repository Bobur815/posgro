import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { SiteConfigModule } from '../site-config/site-config.module';
import { BalanceService } from './balance.service';
import { BillingService } from './billing.service';

@Module({
  imports: [PrismaModule, SiteConfigModule],
  providers: [BalanceService, BillingService],
  exports: [BalanceService, BillingService],
})
export class BillingModule {}
