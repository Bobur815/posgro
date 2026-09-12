import { Module } from '@nestjs/common';
import { StoresController } from './stores.controller';
import { StoreConfigController } from './store-config.controller';
import { StoresService } from './stores.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { SiteConfigModule } from '../site-config/site-config.module';
import { LicensesModule } from '../licenses/licenses.module';

@Module({
  imports: [PrismaModule, SiteConfigModule, LicensesModule],
  controllers: [StoresController, StoreConfigController],
  providers: [StoresService],
  exports: [StoresService],
})
export class StoresModule {}
