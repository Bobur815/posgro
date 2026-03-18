import { Module } from '@nestjs/common';
import { StoresController } from './stores.controller';
import { StoreConfigController } from './store-config.controller';
import { StoresService } from './stores.service';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [StoresController, StoreConfigController],
  providers: [StoresService],
  exports: [StoresService],
})
export class StoresModule {}
