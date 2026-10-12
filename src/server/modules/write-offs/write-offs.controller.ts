import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { User } from '@prisma/client';
import { WriteOffsService } from './write-offs.service';
import { CreateWriteOffDto, WRITE_OFF_REASONS, WriteOffReason } from './dto/create-write-off.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { StoreGuard } from '../../common/guards/store.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CurrentStore } from '../../common/decorators/current-store.decorator';

@ApiTags('write-offs')
@Controller('write-offs')
@UseGuards(JwtAuthGuard, StoreGuard, RolesGuard)
@Roles('ADMIN')
@ApiBearerAuth('JWT-auth')
export class WriteOffsController {
  constructor(private readonly writeOffsService: WriteOffsService) {}

  @Post()
  @ApiOperation({ summary: 'Write off expired, damaged or other goods (Admin only)' })
  @ApiResponse({ status: 201, description: 'Write-off posted; stock decremented' })
  @ApiResponse({ status: 400, description: 'Note missing for OTHER, duplicate line, or more than in stock' })
  async create(
    @CurrentStore() storeId: string,
    @Body() dto: CreateWriteOffDto,
    @CurrentUser() user: User,
  ) {
    return this.writeOffsService.create(storeId, dto, user);
  }

  @Get()
  @ApiOperation({ summary: 'List write-offs (Admin only)' })
  @ApiQuery({ name: 'search', required: false, type: String, description: 'Matches №, note or employee' })
  @ApiQuery({ name: 'reason', required: false, enum: WRITE_OFF_REASONS })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Paginated list of write-offs' })
  async findAll(
    @CurrentStore() storeId: string,
    @Query('search') search?: string,
    @Query('reason') reason?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.writeOffsService.findAll(storeId, {
      search,
      reason: (WRITE_OFF_REASONS as readonly string[]).includes(reason ?? '')
        ? (reason as WriteOffReason)
        : undefined,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'One write-off with its lines (Admin only)' })
  @ApiResponse({ status: 200, description: 'Write-off document' })
  @ApiResponse({ status: 404, description: 'Not found' })
  async findOne(@CurrentStore() storeId: string, @Param('id') id: string) {
    return this.writeOffsService.findOne(storeId, id);
  }
}
