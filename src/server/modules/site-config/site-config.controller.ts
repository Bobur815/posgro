import { Controller, Get, Put, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { IsString } from 'class-validator';
import { SiteConfigService, LoginBanner } from './site-config.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

class LoginBannerDto {
  @IsString() imageUrl!: string;
  @IsString() title!: string;
  @IsString() subtitle!: string;
}

@ApiTags('site-config')
@Controller('site-config')
export class SiteConfigController {
  constructor(private readonly siteConfigService: SiteConfigService) {}

  @Get('login-banner')
  @ApiOperation({ summary: 'Get login page right-panel banner (public)' })
  getLoginBanner(): Promise<LoginBanner> {
    return this.siteConfigService.getLoginBanner();
  }

  @Put('login-banner')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Update login page banner (super admin only)' })
  setLoginBanner(@Body() dto: LoginBannerDto): Promise<LoginBanner> {
    return this.siteConfigService.setLoginBanner(dto);
  }
}
