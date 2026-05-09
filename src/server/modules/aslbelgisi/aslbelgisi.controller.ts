import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AslBelgisiService } from './aslbelgisi.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@ApiTags('aslbelgisi')
@Controller('aslbelgisi')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT-auth')
export class AslBelgisiController {
  constructor(private readonly service: AslBelgisiService) {}

  @Post('verify')
  @ApiOperation({ summary: 'Verify a DataMatrix marking code via ASL BELGISI' })
  verify(@Body('code') code: string) {
    return this.service.verifyCode(code);
  }
}
