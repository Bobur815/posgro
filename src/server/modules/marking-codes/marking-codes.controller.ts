import { Controller, Get, Post, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { MarkingCodesService } from './marking-codes.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { StoreGuard } from '../../common/guards/store.guard';
import { CurrentStore } from '../../common/decorators/current-store.decorator';

@ApiTags('marking-codes')
@Controller('marking-codes')
@UseGuards(JwtAuthGuard, StoreGuard)
@ApiBearerAuth('JWT-auth')
export class MarkingCodesController {
  constructor(private readonly service: MarkingCodesService) {}

  @Get('check')
  @ApiOperation({ summary: 'Check if a marking code has been sold' })
  check(@CurrentStore() storeId: string, @Query('code') code: string) {
    return this.service.check(storeId, code);
  }

  @Post('record')
  @ApiOperation({ summary: 'Record marking codes as sold after a completed sale' })
  record(
    @CurrentStore() storeId: string,
    @Body() body: { codes: { code: string; productBarcode?: string; soldAt?: string }[]; terminalId: string },
  ) {
    return this.service.record(storeId, body.codes ?? [], body.terminalId);
  }
}
