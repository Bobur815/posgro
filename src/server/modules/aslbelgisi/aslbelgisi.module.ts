import { Module } from '@nestjs/common';
import { AslBelgisiController } from './aslbelgisi.controller';
import { AslBelgisiService } from './aslbelgisi.service';

@Module({
  controllers: [AslBelgisiController],
  providers: [AslBelgisiService],
})
export class AslBelgisiModule {}
