import { Module } from '@nestjs/common';
import { TelegramModule } from '../telegram/telegram.module';
import { SmenaController } from './smena.controller';
import { SmenaService } from './smena.service';

@Module({
  // TelegramModule, so a shift opening or closing reaches the store's admins. Not a cycle:
  // nothing the Telegram module imports reaches back here.
  imports: [TelegramModule],
  controllers: [SmenaController],
  providers: [SmenaService],
  exports: [SmenaService],
})
export class SmenaModule {}
