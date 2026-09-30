import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from '../../prisma/prisma.module';
import { TelegramModule } from '../telegram/telegram.module';
import { LeadsController } from './leads.controller';
import { LeadsService } from './leads.service';
import { LeadsThrottlerGuard } from './leads-throttler.guard';

@Module({
  imports: [
    PrismaModule,
    TelegramModule,
    // Scoped to this module: only the public lead form is throttled, never the POS sync traffic.
    // Per-route limits come from @Throttle on the controller; these are the fallbacks.
    ThrottlerModule.forRoot([
      { name: 'short', ttl: 60_000, limit: 3 },
      { name: 'long', ttl: 3_600_000, limit: 10 },
    ]),
  ],
  controllers: [LeadsController],
  providers: [LeadsService, LeadsThrottlerGuard],
})
export class LeadsModule {}
