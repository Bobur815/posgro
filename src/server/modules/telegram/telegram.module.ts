import { Module } from '@nestjs/common';
import { TelegramService } from './telegram.service';
import { ProductsModule } from '../products/products.module';
import { InventoryModule } from '../inventory/inventory.module';
import { UsersModule } from '../users/users.module';
import { SuppliersModule } from '../suppliers/suppliers.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { StoresModule } from '../stores/stores.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { LogAlertsService } from './log-alerts.service';

@Module({
  imports: [
    ProductsModule,
    InventoryModule,
    UsersModule,
    SuppliersModule,
    AnalyticsModule,
    StoresModule,
    PrismaModule,
  ],
  providers: [TelegramService, LogAlertsService],
  // LogsModule imports this module for LogAlertsService; TelegramService is exported for the
  // notification helpers.
  exports: [TelegramService, LogAlertsService],
})
export class TelegramModule {}
