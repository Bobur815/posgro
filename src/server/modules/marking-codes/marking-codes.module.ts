import { Module } from '@nestjs/common';
import { MarkingCodesController } from './marking-codes.controller';
import { MarkingCodesService } from './marking-codes.service';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [MarkingCodesController],
  providers: [MarkingCodesService],
})
export class MarkingCodesModule {}
