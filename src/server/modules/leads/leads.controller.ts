import {
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { LeadRequest } from '@prisma/client';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { LeadsService } from './leads.service';
import { LeadsThrottlerGuard } from './leads-throttler.guard';
import { CreateLeadDto } from './dto/create-lead.dto';
import { ListLeadsQueryDto, UpdateLeadDto } from './dto/update-lead.dto';

/** Off unless LEADS_ENABLED=true: the public form endpoint does not exist until it is switched on. */
const leadsEnabled = () => process.env.LEADS_ENABLED === 'true';

@ApiTags('leads')
@Controller('leads')
export class LeadsController {
  constructor(private readonly leads: LeadsService) {}

  /** The posgro.uz "So'rov qoldiring" form. Public, so rate-limited per client IP. */
  @Post()
  @HttpCode(201)
  @UseGuards(LeadsThrottlerGuard)
  @Throttle({ short: { limit: 3, ttl: 60_000 }, long: { limit: 10, ttl: 3_600_000 } })
  @ApiOperation({ summary: 'Leave a request from the landing page (public)' })
  create(@Body() dto: CreateLeadDto): Promise<{ ok: true }> {
    if (!leadsEnabled()) throw new NotFoundException();
    return this.leads.create(dto);
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'List landing requests, newest first (super admin only)' })
  findAll(@Query() query: ListLeadsQueryDto): Promise<LeadRequest[]> {
    return this.leads.findAll(query);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Set a request status or note (super admin only)' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateLeadDto,
    @CurrentUser('id') userId: string,
  ): Promise<LeadRequest> {
    return this.leads.update(id, dto, userId);
  }
}
