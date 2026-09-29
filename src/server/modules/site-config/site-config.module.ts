import { Module } from '@nestjs/common';
import { SiteConfigController } from './site-config.controller';
import { SiteConfigService } from './site-config.service';
import { LandingHeroVideoService } from './landing-hero-video.service';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [SiteConfigController],
  providers: [SiteConfigService, LandingHeroVideoService],
  exports: [SiteConfigService],
})
export class SiteConfigModule {}
