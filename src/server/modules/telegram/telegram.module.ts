import { Module } from '@nestjs/common';
import { TelegramService } from './telegram.service';
import { ProductsModule } from '../products/products.module';
import { InventoryModule } from '../inventory/inventory.module';
import { UsersModule } from '../users/users.module';
import { SuppliersModule } from '../suppliers/suppliers.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { StoresModule } from '../stores/stores.module';

@Module({
  imports: [ProductsModule, InventoryModule, UsersModule, SuppliersModule, AnalyticsModule, StoresModule],
  providers: [TelegramService],
  exports: [TelegramService],
})
export class TelegramModule {}
