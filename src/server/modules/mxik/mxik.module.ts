import { Module } from '@nestjs/common';
import { MxikService } from './mxik.service';
import { MxikController } from './mxik.controller';

@Module({
  controllers: [MxikController],
  providers: [MxikService],
  exports: [MxikService],
})
export class MxikModule {}
