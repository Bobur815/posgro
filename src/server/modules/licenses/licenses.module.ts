import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { PrismaModule } from '../../prisma/prisma.module';
import { SiteConfigModule } from '../site-config/site-config.module';
import { LicensesController } from './licenses.controller';
import { LicensesService } from './licenses.service';
import { SubscriptionInterceptor } from './subscription.interceptor';

@Module({
  imports: [PrismaModule, SiteConfigModule],
  controllers: [LicensesController],
  providers: [
    LicensesService,
    // Global: every route a till can reach, minus the ones marked @AllowWhenBlocked().
    { provide: APP_INTERCEPTOR, useClass: SubscriptionInterceptor },
  ],
  exports: [LicensesService],
})
export class LicensesModule {}
