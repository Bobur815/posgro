import { Module } from '@nestjs/common';
import { TelegramService } from './telegram.service';
import { ProductsModule } from '../products/products.module';
import { InventoryModule } from '../inventory/inventory.module';

@Module({
  imports: [ProductsModule, InventoryModule],
  providers: [TelegramService],
  exports: [TelegramService],
})
export class TelegramModule {}
