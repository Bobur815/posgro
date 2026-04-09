import { Module } from '@nestjs/common';
import { TerminalsController } from './terminals.controller';
import { TerminalsService } from './terminals.service';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [TerminalsController],
  providers: [TerminalsService],
})
export class TerminalsModule {}
