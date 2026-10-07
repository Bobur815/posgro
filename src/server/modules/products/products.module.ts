import { Module } from '@nestjs/common';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { ProductsValidityService } from './products-validity.service';

@Module({
  controllers: [ProductsController],
  providers: [ProductsService, ProductsValidityService],
  exports: [ProductsService],
})
export class ProductsModule {}
