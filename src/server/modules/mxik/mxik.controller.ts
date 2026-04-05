import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { MxikService } from './mxik.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';

@ApiTags('mxik')
@Controller('mxik')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
@ApiBearerAuth('JWT-auth')
export class MxikController {
  constructor(private readonly mxikService: MxikService) {}

  @Get('code/:code')
  @ApiOperation({ summary: 'Look up MXIK classification by 17-digit code' })
  getByCode(@Param('code') code: string) {
    return this.mxikService.getByCode(code);
  }

  @Get('search/:barcode')
  @ApiOperation({ summary: 'Find MXIK classification by product barcode (EAN-13)' })
  searchByBarcode(@Param('barcode') barcode: string) {
    return this.mxikService.searchByBarcode(barcode);
  }
}
