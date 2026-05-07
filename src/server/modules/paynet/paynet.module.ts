import { Module } from '@nestjs/common';
import { PaynetService } from './paynet.service';
import { PaynetController } from './paynet.controller';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [PaynetController],
  providers: [PaynetService],
  exports: [PaynetService],
})
export class PaynetModule {}
