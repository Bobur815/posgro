import { Controller, Post, Get, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { TerminalsService } from './terminals.service';
import { HeartbeatDto } from './dto/heartbeat.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { StoreGuard } from '../../common/guards/store.guard';
import { CurrentStore } from '../../common/decorators/current-store.decorator';

@ApiTags('terminals')
@Controller('terminals')
@UseGuards(JwtAuthGuard, StoreGuard)
@ApiBearerAuth('JWT-auth')
export class TerminalsController {
  constructor(private readonly terminalsService: TerminalsService) {}

  @Post('heartbeat')
  @ApiOperation({ summary: 'Record a terminal heartbeat after sync' })
  @ApiResponse({ status: 200, description: 'Heartbeat recorded' })
  async heartbeat(
    @CurrentStore() storeId: string,
    @Body() dto: HeartbeatDto,
  ) {
    return this.terminalsService.upsertHeartbeat(storeId, dto);
  }

  @Get('status')
  @ApiOperation({ summary: 'Get sync status for all terminals in the store' })
  @ApiResponse({ status: 200, description: 'List of terminal statuses' })
  async getStatus(@CurrentStore() storeId: string) {
    return this.terminalsService.getStatus(storeId);
  }
}
