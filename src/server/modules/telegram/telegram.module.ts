import { Module } from '@nestjs/common';
import { TelegramService } from './telegram.service';
import { ProductsModule } from '../products/products.module';
import { InventoryModule } from '../inventory/inventory.module';
import { UsersModule } from '../users/users.module';
import { SuppliersModule } from '../suppliers/suppliers.module';
import { AnalyticsModule } from '../analytics/analytics.module';

@Module({
  imports: [ProductsModule, InventoryModule, UsersModule, SuppliersModule, AnalyticsModule],
  providers: [TelegramService],
  exports: [TelegramService],
})
export class TelegramModule {}
