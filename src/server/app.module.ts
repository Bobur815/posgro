import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { ProductsModule } from './modules/products/products.module';
import { SalesModule } from './modules/sales/sales.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { TelegramModule } from './modules/telegram/telegram.module';
import { SuppliersModule } from './modules/suppliers/suppliers.module';
import { StoresModule } from './modules/stores/stores.module';
import { InvoiceScannerModule } from './modules/invoice-scanner/invoice-scanner.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrismaModule,
    AuthModule,
    UsersModule,
    ProductsModule,
    SalesModule,
    InventoryModule,
    AnalyticsModule,
    TelegramModule,
    SuppliersModule,
    StoresModule,
    InvoiceScannerModule,
  ],
})
export class AppModule {}
